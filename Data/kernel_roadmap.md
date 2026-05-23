# Kernel Roadmap — Comprehensive Task List

A full analysis of what must be fixed, updated, and added to bring this kernel to a correct, efficient, and feature-complete state. Items are ordered within each phase by dependency and correctness priority.

---

## Phase 0 — Critical Bugs & Correctness Fixes (Do First)

These are existing bugs or incorrectnesses that will cause undefined behaviour, data corruption, or silent failures in later phases if not resolved now.

### 0.1 — boot.asm: Multiboot magic number check is too late

**Problem:** `mov esi, eax` and `mov edi, ebx` execute *before* the magic number check. If `eax` does not contain `0x36d76289` (i.e. not a multiboot2 boot), the registers are already clobbered before `jne no_multiboot` fires, so the saved "info" values in esi/edi are garbage.

**Fix:** Move the `cmp eax, 0x36d76289 / jne no_multiboot` check to be the *very first instruction* in `start:`, before any register moves.

---

### 0.2 — boot.asm: CPUID check misidentifies failure as "no multiboot"

**Problem:** The CPUID and long-mode checks all jump to `no_multiboot` on failure, which is misleading and makes debugging impossible. A CPU that doesn't support long mode is not a "no multiboot" failure.

**Fix:** Add distinct error labels: `no_cpuid`, `no_long_mode`, `no_multiboot`. Each should write a distinct error code to a known address (e.g., a status byte at a fixed location) or print to VGA before halting, so you can distinguish the failure mode.

---

### 0.3 — boot.asm: Stack is only 256 KB — too small for a real kernel

**Problem:** `resb 4096 * 64` is 256 KB. Once you add IRQ handlers, kernel allocations, and a scheduler, stack overflows will be silent and catastrophic.

**Fix:** Increase to at least `4096 * 128` (512 KB). Set `stack_top` as the *high* address and `stack_bottom` as the *low* address. `rsp` is correctly set to `stack_top` already — just ensure the size is adequate.

---

### 0.4 — paging.rs: Physical address ≠ virtual address assumption is wrong and will break

**Problem:** `active_level_4_table()` treats the physical address from CR3 as a virtual address by casting it directly to a pointer. This works only because your identity map covers low addresses. The moment you unmap identity pages or load a kernel above 1 MB with a non-identity map, this silently accesses wrong memory.

**Fix:** Implement a proper physical-to-virtual translation function. For now, define a `PHYS_OFFSET` constant (e.g., `0xFFFF_8000_0000_0000` for a higher-half kernel) and use `phys + PHYS_OFFSET` everywhere physical addresses are dereferenced. This must be done *before* you move to a higher-half layout (Phase 1).

---

### 0.5 — paging.rs: `map_to` leaks intermediate page table frames on double-map

**Problem:** If `map_to` is called twice for overlapping virtual ranges, the `assert!(p1_entry.is_unused())` panics, but the *intermediate* P3/P2/P1 frames allocated before reaching P1 are already consumed and lost. The allocator cannot reclaim them.

**Fix:** Before allocating a new intermediate frame, check `is_unused()` at each level first. Only allocate if the entry is truly absent. This is the correct walk pattern: check → allocate-if-absent → descend.

---

### 0.6 — memory.rs: BumpAllocator does not skip kernel memory or special regions

**Problem:** `BumpAllocator::init` starts at `kernel_end`, but your boot stack, multiboot info structure, VGA buffer region, and ACPI tables may fall within type-1 "available" memory map entries. Allocating over them causes silent corruption.

**Fix:** In `allocate_frame`, after computing `candidate`, skip over:
- The multiboot info structure range (`mbi_addr` to `mbi_addr + total_size + 4096`)
- `0x0000` to `0x1000` (real-mode IVT / BIOS data area)
- `0xA0000` to `0x100000` (VGA/BIOS reserved)
- The boot stack range (`stack_bottom` to `stack_top`)

This requires passing those ranges into the allocator at init time.

---

### 0.7 — interrupt.rs: Page fault and double fault handlers loop forever with no recovery

**Problem:** Both `page_fault_handler` and `double_fault_handler` end in `loop {}` (or `exit_qemu` in tests). In real kernel operation, a page fault may be a legitimate demand-paging event that should be handled and resumed. Looping forever prevents any future use of a proper virtual memory subsystem.

**Fix:** Page fault handler must be structured to:
1. Read CR2 (faulting address) and the error code.
2. Consult a "virtual memory area" (VMA) list to determine if the fault is expected (demand page, copy-on-write).
3. If expected: map the frame and `iretq`. If unexpected: trigger a kernel panic with full context.

For now, implement the panic path properly (see 0.9), and leave a clear `// TODO: demand paging` stub.

---

### 0.8 — interrupt.rs: No hardware interrupt support (PIC/APIC not initialised)

**Problem:** The IDT only handles CPU exceptions (breakpoint, page fault, double fault). No external hardware interrupts (timer, keyboard, disk) are set up. Without a timer IRQ, there is no preemption, and without keyboard/disk IRQs, there is no I/O.

**Fix:** Implement PIC (8259) or APIC initialisation. The correct long-term solution is the APIC:
1. Parse ACPI MADT table to find APIC base addresses.
2. Disable the legacy 8259 PIC (mask all IRQs, send EOI).
3. Map the Local APIC MMIO region.
4. Initialise the I/O APIC for IRQ routing.
5. Register an IDT entry for the timer (IRQ0, vector 32+) and keyboard (IRQ1, vector 33+).

---

### 0.9 — lib.rs: Panic handler is silent in non-test builds

**Problem:** In non-test builds, `panic!` only calls `println!` (VGA) and then `loop {}`. There is no serial output, no register dump, no stack trace. If VGA is broken, the panic is invisible.

**Fix:** The panic handler should:
1. Always write to serial first (serial is more reliable than VGA).
2. Dump the CPU registers (use inline assembly to read RSP, RBP, RIP, RFLAGS).
3. Walk the stack frames and print return addresses (requires frame pointers: compile with `-C force-frame-pointers=yes`).
4. Then `loop {}` or `hlt` in a loop.

---

### 0.10 — vga_buffer.rs: `clear_screen` bypasses the safe `Writer` abstraction

**Problem:** `clear_screen()` uses raw pointer arithmetic directly to `0xb8000` while `WRITER` also owns that address. These can race and both access the same memory without synchronisation.

**Fix:** Either remove `clear_screen` and implement a `clear` method on `Writer` (which acquires the `Mutex`), or ensure `clear_screen` is only ever called before `WRITER` is initialised and document this invariant clearly.

---

## Phase 1 — Memory Subsystem Completion

### 1.1 — Implement a proper physical frame allocator to replace BumpAllocator

**Problem:** `BumpAllocator` never frees frames. It works for bootstrapping but is unsuitable as the permanent allocator because freed frames (e.g., from unmapped pages) cannot be reused, leading to memory exhaustion.

**Solution:** Implement a **free-list frame allocator** backed by a bitmap:
- Allocate one contiguous region of physical memory to hold a bitmap (1 bit per 4 KB frame).
- Mark all frames as used initially.
- Walk the multiboot memory map and mark type-1 (available) frames as free.
- Mark the kernel image, boot stack, and multiboot structures as permanently used.
- `allocate_frame()` scans the bitmap for the first free bit, marks it used.
- `deallocate_frame(addr)` clears the bit.

This is O(n) on allocation but O(1) on free, correct, and memory-efficient.

---

### 1.2 — Implement a kernel heap allocator

**Problem:** There is no heap. You cannot use `Box`, `Vec`, `String`, `Arc`, or any dynamic allocation. This makes every non-trivial data structure impossible.

**Solution:** Implement a **slab allocator** for fixed-size objects (the most cache-efficient approach for a kernel):
1. Implement a linked-list allocator first as a fallback for arbitrary sizes (the `linked_list_allocator` crate is suitable as a starting point).
2. On top of it, build slab caches for common sizes (8, 16, 32, 64, 128, 256, 512, 1024 bytes).
3. Register it with Rust's `#[global_allocator]`.
4. Map a fixed kernel heap virtual region (e.g., 4 MB starting at a known high address) using `map_to` during init.

---

### 1.3 — Implement `unmap` and `deallocate_frame` in paging.rs

**Problem:** There is no way to unmap a virtual page or free a physical frame. This prevents implementing process exit, shared memory teardown, or any dynamic mapping.

**Fix:** Add:
```rust
pub fn unmap(page: Page, p4_table: &mut PageTable) -> PhysFrame
```
Which clears the P1 entry, flushes the TLB, and returns the frame so the caller can free it. Then add `deallocate_frame(addr: usize)` to the frame allocator.

---

### 1.4 — Move to a higher-half kernel layout

**Problem:** The kernel currently runs with an identity-mapped address space. This is incompatible with user-space isolation: user processes also need lower virtual addresses, and the kernel must not be visible in user mappings.

**Solution:**
1. Define a `KERNEL_OFFSET` (e.g., `0xFFFF_FFFF_8000_0000`, the "higher half" of the 64-bit address space).
2. Add a Multiboot2 address tag or modify the linker script so the kernel is linked at `KERNEL_OFFSET + 1M`.
3. In `boot.asm`, create an early page table that maps `KERNEL_OFFSET` to physical `0x0` (keeping the identity map temporarily), then jump to the high address.
4. Once in the high address, remove the identity map.
5. Update `active_level_4_table` and all physical-to-virtual conversions to use the offset.

---

### 1.5 — Implement `translate_addr` (virtual → physical)

**Problem:** You have no way to translate a virtual address back to a physical one. This is needed for DMA, device drivers, and debugging.

**Fix:** Implement a proper 4-level page table walk:
```rust
pub fn translate_addr(addr: VirtAddr, p4_table: &PageTable) -> Option<PhysAddr>
```
Walk P4→P3→P2→P1, checking PRESENT at each level, handling huge pages (2 MB/1 GB) by reading the address from the P2 or P3 entry directly.

---

## Phase 2 — Interrupt & Hardware Infrastructure

### 2.1 — Implement APIC timer

**Problem:** Without a timer interrupt, you cannot implement preemptive scheduling, sleep/timeout, or any time-based operation.

**Fix:**
1. Read the APIC timer frequency by calibrating against the PIT (program the PIT for a known interval, count APIC ticks).
2. Program the APIC timer in periodic mode.
3. In the timer IRQ handler, increment a global tick counter and call the scheduler's `tick()` function.
4. Send EOI to the APIC at the end of every IRQ handler.

---

### 2.2 — Implement PS/2 keyboard driver

**Fix:**
1. Register IDT vector 33 (IRQ1) for the keyboard.
2. In the handler: read the scancode from port `0x60`.
3. Decode scancodes using a scancode set 2 table to keycodes.
4. Push keycodes into a fixed-size ring buffer (lockless if possible: a single-producer single-consumer ring with atomic indices).
5. Expose `read_key() -> Option<KeyEvent>` to the rest of the kernel.

---

### 2.3 — Implement ACPI table parsing

**Problem:** All modern hardware configuration (APIC, power management, PCIe) is described by ACPI tables. Without parsing them, you are hard-coding addresses that differ across machines.

**Fix:**
1. Find the RSDP (Root System Description Pointer) from the multiboot2 ACPI tag (type 14/15).
2. Parse the RSDT/XSDT to find child tables by signature.
3. Parse the MADT (Multiple APIC Description Table) to locate the Local APIC address and I/O APIC address.
4. Parse the FADT for power management registers (needed for clean shutdown).

---

### 2.4 — Implement correct IRQ/EOI discipline for all handlers

**Problem:** Without sending End-of-Interrupt (EOI) to the APIC/PIC at the end of hardware IRQ handlers, the interrupt controller will never issue another interrupt of the same or lower priority. The system will freeze after the first IRQ.

**Fix:** Every hardware IRQ handler (not CPU exceptions) must end with:
```rust
unsafe { LOCAL_APIC.end_of_interrupt(); }
```
This must be done *before* any potential re-enabling of interrupts (`sti`).

---

### 2.5 — Add NMI, GPF, and other critical exception handlers

**Problem:** General Protection Fault (`#GP`), Invalid Opcode (`#UD`), Stack Segment Fault (`#SS`), and others have no handlers. They will cause a double fault (and then a triple fault/reboot) with no diagnostic.

**Fix:** Register handlers for at minimum:
- `#GP` (vector 13) — prints faulting instruction address + error code
- `#UD` (vector 6) — invalid opcode
- `#SS` (vector 12) — stack segment fault
- `#NMI` (vector 2) — non-maskable interrupt (hardware error signal)
- `#MF` / `#XM` (vectors 16, 19) — FPU/SSE faults

All should do a full panic with register dump (see 0.9).

---

## Phase 3 — Process & Scheduler

### 3.1 — Define a `Task` / `Process` structure

**Requirements:**
```rust
struct Task {
    id: u64,
    state: TaskState,          // Running, Ready, Blocked, Zombie
    kernel_stack: VirtAddr,    // Stack used when handling syscalls/IRQs for this task
    page_table: PhysAddr,      // This task's P4 table (own address space)
    saved_context: Context,    // Saved register state
    priority: u8,
}
```
Tasks must each have their own kernel stack (not the boot stack). Allocate a kernel stack per task from the heap.

---

### 3.2 — Implement context switching

**Fix:** Implement `switch_to(from: &mut Context, to: &Context)` in assembly. It must save/restore:
- Callee-saved registers: `rbx`, `rbp`, `r12`–`r15`
- `rsp` (stack pointer)
- `rip` (via a `call`/`ret` trick or explicit save)
- CR3 (page table pointer) — only if switching address spaces

Use `naked` functions in Rust (`#[naked]`) or a dedicated `.asm` file for this.

---

### 3.3 — Implement a scheduler

**Solution:** Start with a **multi-level feedback queue (MLFQ)** — the most effective balance of responsiveness and throughput:
- 3–4 priority queues (each a round-robin runqueue).
- New tasks enter the highest-priority queue.
- A task that exhausts its time slice is demoted to a lower-priority queue.
- A task that blocks voluntarily (I/O wait) is promoted back up when unblocked.
- The timer IRQ calls `schedule()` which selects the next task and calls `switch_to`.

---

### 3.4 — Implement per-CPU data structures

**Problem:** When you add SMP (multiple cores), globals like `ALLOCATOR`, `WRITER`, and the current-task pointer will need per-CPU variants. Designing for this now avoids a painful refactor later.

**Fix:**
- Use the `GS` segment register to point to a per-CPU data block (set up during AP startup with `WRMSR` to `MSR_GS_BASE`).
- The per-CPU block contains: pointer to current task, kernel RSP, CPU ID, APIC ID.
- Access via `gs:[offset]` in assembly stubs, or a `cpu_local!` macro in Rust.

---

## Phase 4 — System Call Interface

### 4.1 — Implement syscall entry/exit via `SYSCALL`/`SYSRET`

**Problem:** There is no mechanism for user-space code to request kernel services.

**Fix:**
1. Set `IA32_LSTAR` MSR to the address of the `syscall_entry` asm stub.
2. Set `IA32_STAR` MSR with the correct kernel/user CS/SS selectors.
3. Set `IA32_FMASK` to mask interrupts on entry.
4. The `syscall_entry` stub must: swap to the kernel stack (from `gs:[kernel_rsp]`), save all registers, call a Rust `syscall_dispatch(nr, args)`, restore registers, `sysretq`.
5. Define initial syscalls: `write` (fd, buf, len), `exit` (code), `yield` ().

---

### 4.2 — Add a data segment and user GDT entries

**Problem:** The current GDT only has a null descriptor and a kernel code segment. User-space requires user code (DPL=3) and user data (DPL=3) segments, and `SYSRET` requires them in specific GDT slots.

**Fix:** Add to `gdt.rs`:
- Kernel data segment (DPL=0)
- User code segment (DPL=3)
- User data segment (DPL=3)

The layout must follow the `STAR` MSR convention: kernel CS at offset N, user CS at offset N+16 (with user data at N+8).

---

## Phase 5 — VFS & Storage

### 5.1 — Define a Virtual Filesystem interface

**Fix:** Define a trait:
```rust
trait FileSystem {
    fn open(&self, path: &str, flags: OpenFlags) -> Result<FileHandle, FsError>;
    fn read(&self, handle: &FileHandle, buf: &mut [u8]) -> Result<usize, FsError>;
    fn write(&self, handle: &FileHandle, buf: &[u8]) -> Result<usize, FsError>;
    fn close(&self, handle: FileHandle);
    fn readdir(&self, path: &str) -> Result<DirIterator, FsError>;
    fn stat(&self, path: &str) -> Result<FileStat, FsError>;
}
```
The VFS layer holds a mount table mapping path prefixes to `Box<dyn FileSystem>` instances.

---

### 5.2 — Implement an initramfs (initial RAM filesystem)

**Problem:** Before any disk driver exists, the kernel needs a way to load initial programs. An initramfs embedded in the kernel image (or passed as a multiboot2 module) solves this.

**Fix:**
1. Embed a CPIO or tar archive as a multiboot2 module (tag type 3).
2. Parse the archive in Rust to build an in-memory tree of `(path, &[u8])` pairs.
3. Implement `FileSystem` for it (read-only is fine for now).
4. Mount it at `/`.

---

### 5.3 — Implement an ATA/AHCI disk driver

**Fix (AHCI, correct modern approach):**
1. Enumerate PCI devices to find an AHCI controller (class 0x01, subclass 0x06).
2. Map the AHCI HBA MMIO region (from PCI BAR5).
3. Initialise each implemented port: set up a command list (up to 32 slots), FIS receive area, allocate DMA buffers.
4. Issue ATA IDENTIFY to confirm disk parameters.
5. Issue DMA READ (command 0x25 for LBA48) for read requests.
6. Handle completion interrupts.

---

### 5.4 — Implement a filesystem: ext2 or FAT32

**Recommendation:** Implement **ext2** first — it is simpler than ext4, well-documented, and directly maps to standard Unix concepts (inodes, directory entries, block groups). FAT32 is easier but has no permissions model, making it unsuitable as the root filesystem.

---

## Phase 6 — User Space

### 6.1 — Implement ELF loader

**Fix:**
1. Parse the ELF64 header and program headers.
2. For each `PT_LOAD` segment: allocate physical frames, map them at the virtual address specified in the ELF, copy the segment data.
3. Set up a user stack (allocate frames, map them at a fixed high-user address, e.g. `0x0000_7FFF_FFFF_0000`).
4. Create a `Task` with this address space and an initial `rip` pointing to the ELF entry point.
5. Return to user space via `sysretq` with `rsp` pointing to the user stack top.

---

### 6.2 — Implement `mmap` / `munmap` syscalls

**Fix:**
- Maintain a per-process VMA list (virtual memory areas) of `(start, end, flags, backing)`.
- `mmap(addr, len, prot, flags, fd, offset)` adds a VMA entry. Physical frames are allocated lazily on first access (demand paging, see 0.7).
- `munmap` removes VMA entries and unmaps the corresponding pages.

---

### 6.3 — Implement `fork` and `exec`

**`fork`:** Copy the parent's page table (copy-on-write semantics — mark all writable pages read-only and shared; on write fault, copy the frame).

**`exec`:** Replace the calling process's address space with a freshly loaded ELF. Requires tearing down the old VMA list and page table.

---

## Phase 7 — Existing Code Quality Fixes

These are issues in existing code that are not immediately fatal but should be corrected before the codebase grows further.

### 7.1 — boot_info.rs: `MemoryMapEntry` slice is constructed unsafely without validation

**Problem:** `core::slice::from_raw_parts` is called with a count derived from `(tag.size - 16) / entry_size`. If `entry_size` is 0 or `tag.size < 16`, this causes a division-by-zero or absurdly large slice, triggering UB.

**Fix:** Validate `entry_size > 0` and `tag.size >= 16` before computing `num_entries`. Assert that `(tag.size - 16) % entry_size == 0` (entries must exactly fill the tag).

---

### 7.2 — lib.rs: `_start` initialises the allocator inside a tag-parsing loop

**Problem:** The allocator is initialised inside the `if tag_header.typ == 6` branch of the tag iterator loop. If GRUB provides multiple memory map tags (unusual but valid), the allocator is re-initialised, dropping all previous allocations.

**Fix:** Collect the memory map tag pointer first (one pass), then initialise the allocator after the loop exits with the found pointer. Panic if no memory map tag is found.

---

### 7.3 — serial.rs: `_print` panics on write error with `.unwrap()`

**Problem:** `SERIAL1.lock().write_fmt(args).unwrap()` will panic if the serial port is unresponsive. Panicking inside the serial writer (which is called by the panic handler) causes infinite recursion.

**Fix:** Replace `.unwrap()` with explicit error handling. On write failure, attempt to write to VGA directly (bypassing the `Mutex` if needed with `unsafe`) or simply do nothing — a panic handler that itself panics is catastrophic.

---

### 7.4 — vga_buffer.rs: `BUFFER_WIDHT` typo

**Problem:** `BUFFER_WIDHT` is misspelled throughout. This is minor but pollutes the codebase.

**Fix:** Rename to `BUFFER_WIDTH` in all occurrences.

---

### 7.5 — gdt.rs: `pub static mut DOUBLE_FAULT_STACK` is a mutable static

**Problem:** `static mut` in Rust is always `unsafe` to access. Any accidental read after the TSS is loaded could produce a data race on multi-core systems.

**Fix:** Wrap in `UnsafeCell` or a `Once<Stack>`, and only expose the raw pointer to the TSS setup code. After the TSS is loaded, the stack is owned by the hardware and should not be touched by Rust.

---

### 7.6 — lib.rs: unused import `core::hash::BuildHasher`

**Fix:** Remove the unused `use core::hash::BuildHasher` import.

---

### 7.7 — build.sh: `cargo build` without `--target` relies on host toolchain

**Problem:** If the host Rust toolchain has changed or does not have the correct `x86_64-unknown-none` target installed, the build silently produces a host binary instead of a freestanding kernel binary.

**Fix:** Always pass `--target x86_64-unknown-none` (or your custom target JSON) explicitly to `cargo build`. Add a `rust-toolchain.toml` to pin the nightly version and target.

---

### 7.8 — linker.ld: Missing section alignment attributes

**Problem:** The linker script does not set `NOLOAD` on `.bss` or explicitly set `ALIGN(4096)` on section boundaries. Some linkers will produce section overlaps or mis-aligned output.

**Fix:**
```ld
.bss (NOLOAD) : ALIGN(4096) {
    *(.bss .bss.*)
    *(COMMON)
}
```
Also add `ALIGN(4096)` before `.text`, `.rodata`, and `.data` so each section starts on a page boundary — required for setting correct page table permission bits (NX for data, read-only for rodata).

---

## Phase 8 — Testing Infrastructure

### 8.1 — Replace the custom test framework with a proper in-kernel test harness

**Problem:** The current `test_runner` uses `(&str, &dyn Fn())` tuples. It cannot catch panics (a failing test brings down the kernel), has no `#[should_panic]` support, and produces no structured output.

**Fix:**
1. Define a `KernelTest` struct: `{ name: &'static str, test_fn: fn(), should_panic: bool }`.
2. Use a custom linker section (`__test_start`/`__test_end`) to auto-collect all test functions, similar to how the Linux kernel collects `initcall` functions.
3. Run each test in isolation. For panic handling, set a per-test panic hook that sets a global "test failed" flag and longjmps back to the runner (requires `setjmp`/`longjmp` in assembly).
4. Report pass/fail over serial with a summary count at the end.

---

### 8.2 — Add integration tests for each subsystem

Minimum test coverage needed before each phase ships:
- **Memory:** Allocate all frames, verify none are in reserved regions, free all frames, verify bitmap is clean.
- **Paging:** Map a page, write a value, translate_addr the virt→phys, read via phys, unmap, verify fault on access.
- **Interrupts:** Fire a `int3`, verify breakpoint handler ran, verify `iretq` returned correctly.
- **Scheduler:** Create two tasks, verify both run within N timer ticks, verify neither corrupts the other's stack.

---

## Summary Table

| Phase | Area | Effort | Priority |
|-------|------|--------|----------|
| 0 | Bug fixes (multiboot check, paging identity assumption, allocator safety) | Low | Critical |
| 1 | Frame allocator (bitmap), heap (slab), unmap, higher-half layout | Medium | Critical |
| 2 | APIC init, timer IRQ, keyboard, ACPI parsing, full IDT coverage | Medium | High |
| 3 | Task struct, context switch, MLFQ scheduler, per-CPU data | High | High |
| 4 | SYSCALL/SYSRET, GDT user segments, initial syscalls | Medium | High |
| 5 | VFS trait, initramfs, AHCI driver, ext2 | High | Medium |
| 6 | ELF loader, mmap, fork, exec | High | Medium |
| 7 | Code quality (typos, unsafe cleanup, build fixes) | Low | Ongoing |
| 8 | Test harness, per-subsystem tests | Medium | Ongoing |
