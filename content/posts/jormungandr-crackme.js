/**
 * Post: Jörmungandr CrackMe — A Self-Decrypting EC Virtual Machine, a Heap-JIT Validator, and an Anti-Emulation Maze
 * Category: Reverse Engineering
 */

window.Dr4ganData.posts.push({
    id: "jormungandr-crackme",
    title: "Jörmungandr CrackMe — An Elliptic-Curve VM, a Heap-JIT Validator, and a Trap-Flag SMC Shifter",
    date: "06/03/2026",
    category: "Reverse Engineering",
    tags: ["CrackMe", "PE64", "Windows", "Custom VM", "Elliptic Curve", "JIT", "Self-Modifying Code", "Nanomite", "Anti-Debug", "Anti-Emulation", "Direct Syscalls", "Binary Ninja"],
    description: "A statically-linked x64 CrackMe that resolves every API by hash, runs a stack VM doing real elliptic-curve scalar multiplication over GF(2^64-59), assembles its serial validator on the heap byte by byte behind a KUSER_SHARED_DATA anti-emulation mine and an x87 dead-weight block, hides the validator behind a UD2 nanomite and a trap-flag sliding-window SMC scheme, and binds the answer to a clean execution environment so patching and emulation produce a wrong key. The real serial was recovered entirely from static math: 0xE1699E0C06577CD7.",
    image: null,
    content: `
        <div class="space-y-8">
            <!-- Metadata Block -->
            <div class="bg-white/[0.03] p-4 md:p-6 rounded-xl border border-white/5 font-mono text-xs sm:text-sm space-y-3">
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Target</span>
                    <span class="text-white break-words">Jörmungandr CrackMe (jormungandr.exe)</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Platform</span>
                    <span class="text-white break-words">PE64 / x86-64 / Windows 10</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Size</span>
                    <span class="text-white break-words">~122 KB on disk / ~150 KB mapped</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Protection</span>
                    <span class="text-white break-words">Hash-resolved IAT + EC Virtual Machine + Heap-JIT Validator + Trap-Flag SMC + UD2 Nanomite + Anti-Emulation + Direct Syscalls + Decoy Serial</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Tooling</span>
                    <span class="text-white break-words">Binary Ninja 5.2 (HLIL / MLIL / LLIL), Python 3, passive process loader</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 pt-1">
                    <span class="text-text-muted">Result</span>
                    <span class="text-green-400 font-bold tracking-wider break-words">SERIAL_RECOVERED + CLEAN_DONE</span>
                </div>
            </div>

            <h2>1. Target Overview</h2>
            <p>The target is <code>jormungandr.exe</code> &mdash; a 64-bit Windows console binary named after the Midgard Serpent that swallows its own tail. The name is not decoration: the program holds a writable+executable section called <code>.ouro</code>, and the entire success path is a closed loop where the serial is the curve output, the curve output is the key that decrypts the scanner, and the scanner only runs once the curve output has already been accepted as the serial.</p>
            <p>The command-line contract is printed by the binary itself:</p>
            <pre><code class="language-text">jormungandr.exe &lt;PID|ProcessName&gt; &lt;TargetString&gt; &lt;Serial&gt;</code></pre>
            <p>The author's brief set five explicit objectives: get past the parent-process and hardware/hypervisor gates cleanly; find the un-mutated serial that does not trigger the delayed crash and print the persistent success token; defeat the trap-flag SMC shifter and recover the JIT validator in cleartext; bypass the JIT's shared-page and FPU traps; and solve the elliptic-curve math inside the VM. There is also a warning about a decoy serial that prints a success banner and then quietly takes the process down ~30 seconds later. Every objective is addressed below.</p>

            <h2>2. Initial Reconnaissance</h2>

            <h3>2.1 PE Shape</h3>
            <p>Loading the image into Binary Ninja and reading the headers gives a clean picture &mdash; this is not a commercial packer, it is hand-rolled protection on top of an ordinary statically-linked MSVC build.</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Field</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Value</th>
                            <th class="py-2 font-mono uppercase text-xs">Note</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300">
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">Machine</td><td class="py-2"><code>0x8664</code></td><td class="py-2">AMD64</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">ImageBase</td><td class="py-2"><code>0x140000000</code></td><td class="py-2">Standard PE32+ base</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">Entry</td><td class="py-2"><code>0x14000C880</code></td><td class="py-2"><code>_start</code> &mdash; ordinary MSVC CRT startup</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">Runtime</td><td class="py-2">UCRT (static)</td><td class="py-2">CRT linked in &mdash; relevant in §12</td></tr>
                    </tbody>
                </table>
            </div>

            <h3>2.2 Section Table</h3>
            <p>Nine sections. Everything is on-disk and analyzable, but one entry breaks the pattern.</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Name</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">VA Range</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Flags</th>
                            <th class="py-2 font-mono uppercase text-xs">Note</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.text</td><td class="py-1"><code>0x140001000–0x14001B6DC</code></td><td class="py-1">R-X</td><td class="py-1">Code</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.ouro</td><td class="py-1"><code>0x14001C000–0x14001C6EF</code></td><td class="py-1 text-red-400 font-bold">RWX</td><td class="py-1">Self-modifying region &mdash; the scanner</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.data</td><td class="py-1"><code>0x14001D000–0x14001F618</code></td><td class="py-1">RW</td><td class="py-1">Resolver slots, SMC keys, blobs</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.pdata</td><td class="py-1"><code>0x140020000–0x14002117C</code></td><td class="py-1">R</td><td class="py-1">Unwind</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.idata</td><td class="py-1"><code>0x140022000–0x140022AA2</code></td><td class="py-1">R</td><td class="py-1">Thin import table</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.fptable</td><td class="py-1"><code>0x140023000–0x140023100</code></td><td class="py-1">RW</td><td class="py-1">Function-pointer table</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.reloc</td><td class="py-1"><code>0x140024000–0x140024674</code></td><td class="py-1">R</td><td class="py-1">Relocations</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm">
                <p class="text-red-400 font-bold mb-1"><i class="ph ph-shield-warning"></i> The RWX Section</p>
                <p class="text-gray-300">A section named after the ouroboros, flagged <code>RWX</code>, holding 1775 bytes. Writable+executable in a CRT console app is never a compiler artefact. This is where the cross-process scanner lives, shipped XOR-veiled on disk and decrypted in place at runtime. Flagged and set aside for §10.</p>
            </div>

            <h3>2.3 The Thin Import Table</h3>
            <p>The static imports are almost nothing: <code>FlsAlloc</code>, <code>FlsFree</code>, <code>FlsGetValue</code>, <code>FlsSetValue</code>, <code>InitializeCriticalSectionEx</code> &mdash; the CRT's fiber-local-storage plumbing &mdash; plus the <code>kernel32</code> thunks the CRT pulls in. Everything operationally interesting is absent: no <code>VirtualAlloc</code>, no <code>VirtualProtect</code>, no <code>NtReadVirtualMemory</code>, no <code>printf</code>, no <code>malloc</code>. That means dynamic resolution, and the resolver is the first thing to break open before any of the protection makes sense.</p>

            <h2>3. Environment and Toolchain</h2>
            <p>All primary analysis ran statically in Binary Ninja against the on-disk image &mdash; nothing here needs unpacking, the protection is algorithmic, not a packer. The only runtime step was a passive loader used at the very end to confirm the recovered serial, written specifically to avoid every anti-debug vector the binary deploys.</p>
            <ul>
                <li><strong>Binary Ninja 5.2</strong> &mdash; HLIL / MLIL / LLIL decompilation, cross-references, and disassembly. The multi-level IL was essential for the heap-JIT body, where the decompiler's view of overlapping immediate stores is ambiguous and only the raw assembler resolves the byte stream.</li>
                <li><strong>Python 3</strong> &mdash; djb2 hash inversion, the elliptic-curve evaluation, the validator-equation solver, and the PE export-table parsing that closed out the runtime defect in §12.</li>
                <li><strong>Passive process loader</strong> &mdash; a small launcher (CreateProcess suspended, a single remote LoadLibrary, resume) to validate the answer on a live process without ever attaching a debugger.</li>
            </ul>

            <h2>4. The Import-by-Hash Layer</h2>
            <p>Two routines do all symbol resolution, both keyed off the constant <code>0x1337BEEF</code>.</p>

            <h3>4.1 The Hash</h3>
            <p><code>sub_14000A934</code> is plain djb2 over an ASCII string:</p>
            <pre><code class="language-c">uint32_t djb2(const char *s) {
    uint32_t h = 0x1505;
    for (; *s; ++s) h = h * 0x21 + (uint8_t)*s;   // *33, then add
    return h;
}</code></pre>
            <p>A wide-character sibling (<code>sub_14000A94C</code>) folds <code>A-Z</code> to lower case and is used for module names. Every comparison in the binary is against <code>djb2(name) ^ 0x1337BEEF</code>.</p>

            <h3>4.2 Module and Export Resolvers</h3>
            <p><code>sub_14000A774(hash)</code> walks the loader list straight out of the PEB and matches on the lowercased <code>BaseDllName</code>:</p>
            <pre><code class="language-x86asm">mov  rax, gs:[0x60]          ; PEB
xor  esi, 0x1337BEEF         ; target = arg ^ 0x1337BEEF
mov  rdi, [rax+0x18]         ; PEB-&gt;Ldr
add  rdi, 0x20               ; &amp;InMemoryOrderModuleList
mov  rbx, [rdi]
loop:
  mov   rcx, [rbx+0x50]      ; BaseDllName.Buffer  (entry+0x60)
  movzx edx, word [rbx+0x48] ; BaseDllName.Length  (entry+0x58)
  shr   rdx, 1
  call  sub_14000A94C        ; lowercased djb2
  cmp   eax, esi
  je    found
  mov   rbx, [rbx]
  cmp   rbx, rdi
  jne   loop
found:
  mov   rax, [rbx+0x20]      ; DllBase  (entry+0x30)</code></pre>
            <p><code>sub_14000A7DC(base, hash)</code> is a textbook export-directory walk: validate <code>MZ</code>/<code>PE</code>, iterate <code>AddressOfNames</code>, djb2 each, compare against <code>hash ^ 0x1337BEEF</code>, then index through the ordinal table to the function VA.</p>

            <h3>4.3 Direct Syscalls</h3>
            <p>There is a third path for ntdll. A helper resolves an ntdll export, recovers its system-service number from the stub prologue, and writes it into a generic <code>syscall</code> trampoline at <code>data_14001D000</code> (flipped to <code>RWX</code> early in init). Calls such as the process open go straight to <code>syscall</code> without ever touching the ntdll export, sidestepping userland hooks on the <code>Nt*</code> surface. The process is opened with access mask <code>0x438</code> (<code>QUERY_INFORMATION | VM_OPERATION | VM_READ | VM_WRITE</code>) &mdash; exactly what a process the binary intends to read and walk would request.</p>

            <h3>4.4 Recovered Hash Table</h3>
            <p>Brute-forcing the constants against a name list collapses the entire resolver. Modules first:</p>
            <pre><code class="language-text">0x31E40B02  ntdll.dll      0xEC5B9181  msvcrt.dll
0x6377509A  kernel32.dll   0x9C650027  ucrtbase.dll</code></pre>
            <p>Then the functions:</p>
            <pre><code class="language-text">0x065C9557  printf                  0x2B1BB178  VirtualAlloc
0x1E0E13D2  malloc                  0x97784F62  VirtualProtect
0x6FA14E68  free                    0x75B871C1  VirtualFree
0x6FA3829D  atoi                    0xA4EB5332  FlushInstructionCache
0x727A0ECC  GetTickCount64          0x6C3F4ABE  CreateThread
0x197EB6A5  NtDelayExecution        0x471690DE  NtSetInformationThread
0x43347EB7  NtOpenProcess           0x8D39A4AB  NtGetContextThread
0x98B9ADD2  NtClose                 0xFD78CD47  NtQuerySystemInformation
0xF0AA30B2  NtQueryVirtualMemory    0x467C1146  RtlAddVectoredExceptionHandler
0xD177DC0C  NtReadVirtualMemory     0x6C4D24F0  RtlAddVectoredContinueHandler
0x86C4197D  NtWriteVirtualMemory    0x1B1EDC27  NtProtectVirtualMemory</code></pre>
            <p>With the resolver mapped, the rest of the binary reads in plain language.</p>

            <h2>5. main() Control Flow</h2>
            <p><code>main</code> at <code>0x140009940</code> is the spine. Reading top to bottom:</p>
            <ol>
                <li>Resolve <code>ntdll</code>, <code>kernel32</code>, and a CRT module (<code>msvcrt</code>, falling back to <code>ucrtbase</code>).</li>
                <li>Resolve <code>printf</code>, <code>malloc</code>, <code>free</code>, <code>atoi</code> from the CRT module. <strong>If <code>printf</code> does not resolve, return <code>0xDEAD</code> immediately</strong> &mdash; the cause of the silent runs, §12.</li>
                <li>Require <code>argc &gt;= 4</code>; otherwise print usage.</li>
                <li>Register a vectored exception handler and a vectored continue handler.</li>
                <li>Initialise the guard-protected success blob.</li>
                <li>Run the anti-analysis gauntlet (§6).</li>
                <li>Print <code>SEED: 0x7E51</code>.</li>
                <li>Build and run the embedded EC bytecode (§8); pop the result.</li>
                <li>Parse <code>argv[3]</code> into a 64-bit integer.</li>
                <li><strong>Decoy check</strong> (§7).</li>
                <li><strong>Real check</strong> (§9): build and call the heap-JIT validator.</li>
                <li>Resolve <code>argv[1]</code> to a PID, open the process, decrypt the <code>.ouro</code> scanner, spawn the worker (§10), then print the persistent token if the validator passed.</li>
            </ol>

            <h2>6. Anti-Analysis Surface</h2>
            <p>The defining design choice of this binary: almost nothing here aborts on detection. Every check quietly mutates the cryptographic inputs so a tampered run computes a <em>different, wrong</em> serial. There is no branch to flip &mdash; only data to corrupt. That is why patching is a dead end and the only reliable route is to reconstruct the math.</p>

            <h3>6.1 Software-Breakpoint Self-Scan</h3>
            <p>Before the seed print, <code>main</code> scans <code>0x200</code> bytes of a verifier routine for the <code>0xCC</code> byte:</p>
            <pre><code class="language-c">for (i = 0; i &lt; 0x200; ++i)
    if (code[i] == 0xCC) { tainted_flag = 1; break; }</code></pre>
            <p>The tainted flag is consumed later by the VM (§8.3). Drop an <code>INT3</code> on that routine and the curve scalar gets scrambled.</p>

            <h3>6.2 CPUID VM-Exit Latency</h3>
            <p>Twice, the binary times a serialising <code>cpuid</code> between two <code>rdtsc</code> reads:</p>
            <pre><code class="language-c">t0 = rdtsc();
cpuid(1);
t1 = rdtsc();
if (t1 - t0 &gt; 0x3E8)   // &gt; 1000 cycles
    r14 = 0xB0639D6B;   // poisoned key (clean value: 0x0ACE6D66)
...
if (t1 - t0 &gt; 0x3E8)
    r15 = 0x1337BEED;   // poisoned (clean value: 2)</code></pre>
            <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm">
                <p class="text-yellow-400 font-bold mb-1"><i class="ph ph-warning"></i> Math, Not a Branch</p>
                <p class="text-gray-300"><code>r14</code> and <code>r15</code> are not control variables. <code>r14</code> is the elliptic-curve scalar and <code>r15</code> is the base-point X-coordinate fed into the VM. <code>cpuid</code> unconditionally exits to the hypervisor; under virtualisation the round-trip blows past 1000 cycles and both values are silently rewritten. The curve point you land on is wrong, and the serial derived from it is garbage. The check defends the serial, not a jump.</p>
            </div>

            <h3>6.3 Parent-Process Gate</h3>
            <p>A routine queries <code>ProcessBasicInformation</code> for the parent PID, walks the full <code>SystemProcessInformation</code> list to find that PID, pulls its image name, lower-cases the basename, djb2-hashes it, and compares against a five-entry blacklist:</p>
            <pre><code class="language-text">0xC0F80086  explorer.exe
0xCDF3F1E9  cmd.exe
0x3F2682DA  powershell.exe
0x0D02F4FD  devenv.exe
0xAC184C05  (one further analysis-host name)</code></pre>
            <p>A blacklisted parent does not kill the process &mdash; it arms the heavier debugger probe in §6.4. The practical consequence is that launching from a normal shell or from Visual Studio is treated as hostile context. Spawn it from a parent that is not on the list and this whole branch is skipped. That is the clean way past the gate, no patch required.</p>

            <h3>6.4 DuplicateHandle Probe and Thread Hiding</h3>
            <p>When the parent is flagged, <code>main</code> performs the classic pseudo-handle duplication and, on detection, calls <code>NtSetInformationThread(thread, ThreadHideFromDebugger /*0x11*/)</code> to detach the main thread from debugger event delivery.</p>

            <h3>6.5 Watchdog Thread</h3>
            <p>A background thread is spawned that:</p>
            <ul>
                <li>hides itself with <code>ThreadHideFromDebugger</code>,</li>
                <li>loops <code>Sleep(100)</code> and re-reads <code>GetTickCount64</code>; a gap over <code>0x1388</code> (5000 ms) implies the process was frozen at a breakpoint and sets the detection flag,</li>
                <li>calls <code>NtGetContextThread</code> with <code>CONTEXT_DEBUG_REGISTERS</code> and checks <code>Dr0–Dr3</code>; any non-zero debug register (a hardware breakpoint) sets the detection flag,</li>
                <li>cross-checks a second timer source for consistency.</li>
            </ul>
            <p>Hardware breakpoints &mdash; the usual escape from an <code>INT3</code> scan &mdash; are explicitly covered. The detection flag feeds the same VM-input poisoning path.</p>

            <h3>6.6 Nanomite Handlers</h3>
            <p><code>main</code> registers a vectored <em>exception</em> handler and a vectored <em>continue</em> handler before any protected code runs. These two are the engine behind the <code>UD2</code> dispatch and the single-step SMC window in §9. Installing them up front is what lets <code>UD2</code> and the trap flag act as control-flow primitives instead of crashes.</p>

            <h2>7. The Decoy</h2>
            <p>After the seed print and the EC evaluation, <code>main</code> parses the serial and computes a modular exponentiation inline:</p>
            <pre><code class="language-c">// p = 2^64 - 59 = 0xFFFFFFFFFFFFFFC5
uint64_t r = 1, base = 2, e = 0x7E51;     // exponent = the printed seed
while (e) {
    if (e &amp; 1) r = mulmod(r, base, p);
    base = mulmod(base, base, p);
    e &gt;&gt;= 1;
}
if (serial == r) {
    printf("0x%X -&gt; DONE\\n", 0x1337);     // the bait banner
    arm_failure_timer();                  // deferred *(volatile int*)0 = 0xDEADBEEF
    return 0;
}</code></pre>
            <p>The decoy value is the discrete exponential <code>2^0x7E51</code> in the multiplicative group of <code>GF(2^64-59)</code>:</p>
            <pre><code class="language-python">&gt;&gt;&gt; pow(2, 0x7E51, 2**64 - 59)
0x1331D66091E9E2E5</code></pre>
            <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm">
                <p class="text-red-400 font-bold mb-1"><i class="ph ph-skull"></i> The Trap</p>
                <p class="text-gray-300">Enter <code>1331D66091E9E2E5</code> and the program prints <code>0x1337 -&gt; DONE</code>, looks solved, and then tears itself down a short while later through a null write. The group choice is deliberate: the decoy lives in the <em>multiplicative</em> group over the same prime the real check uses for its <em>elliptic-curve</em> group. Same field, different group &mdash; a clean way to make the wrong answer feel plausible.</p>
            </div>

            <h2>8. The Elliptic-Curve VM</h2>
            <p>The real validator's secret comes out of a small stack VM. <code>main</code> builds a context on the stack, loads a tiny bytecode program, runs it, and pops a 64-bit result.</p>

            <h3>8.1 Context and Opcode Camouflage</h3>
            <p>The context holds a 128-entry operand stack, a stack pointer, four registers, a bytecode pointer, an instruction pointer, and a 256-byte opcode-permutation table. Opcodes are not stored as their real values: an xorshift32 keyed by the seed scatters the nineteen real opcodes across pseudo-random byte slots, and on top of that every fetched byte is XORed with a running LCG keystream:</p>
            <pre><code class="language-c">uint8_t b = bytecode[ip] ^ (uint8_t)keystream;
ip++;
keystream = keystream * 0x19660D + 0x3C6EF35F;   // Numerical Recipes LCG</code></pre>
            <p>The build side in <code>main</code> runs the inverse with the identical seed and LCG, so the two streams cancel and the VM executes the plaintext program the author intended &mdash; provided the seed is the clean <code>0x0ACE6D66</code>. Poison the seed (§6.2) and the keystream diverges, decoding the program into noise. The obfuscation is real on disk and inert at runtime.</p>

            <h3>8.2 Instruction Set</h3>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Op</th>
                            <th class="py-2 font-mono uppercase text-xs">Semantics</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">A1 / A2</td><td class="py-1">push a 64-bit immediate (8 fetched bytes)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">B2</td><td class="py-1">push register R[k]</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">C3</td><td class="py-1">pop into register R[k]</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">D4</td><td class="py-1">R[a] = R[b]</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">62</td><td class="py-1">R[a] ^= R[b]</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">61</td><td class="py-1">modular exponentiation: pop base,exp,mod; push base^exp mod mod</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">71</td><td class="py-1">elliptic-curve point add</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">72</td><td class="py-1">elliptic-curve scalar multiply</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">E5 / E6 / E7</td><td class="py-1">external call (direct syscall &mdash; used by the scanner)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">90 / FE / FF / CC</td><td class="py-1">nop / halt</td></tr>
                    </tbody>
                </table>
            </div>
            <p>Opcode <code>72</code> carries an embedded anti-debug clause: if either taint flag is set, the popped scalar is XORed with <code>0xBAADF00D55AA55AA</code> before the multiply. Same defensive pattern &mdash; wrong input, not a stop.</p>

            <h3>8.3 Field and Curve Primitives</h3>
            <p>All arithmetic is mod <code>p = 2^64 - 59</code> (encoded throughout as <code>-0x3B</code>). The primitives are <code>mulmod</code> (Russian-peasant), <code>addmod</code>, and <code>modpow</code> &mdash; the last called with exponent <code>p-2</code> to produce the modular inverse by Fermat. The point routine is a short Weierstrass add/double:</p>
            <ul>
                <li>doubling slope <code>lambda = (3*x^2 + 1) * inv(2*y)</code> &mdash; the <code>+1</code> fixes curve coefficient <strong>a = 1</strong>,</li>
                <li>addition slope <code>(y2 - y1) * inv(x2 - x1)</code>,</li>
                <li><code>x3 = lambda^2 - x1 - x2</code>, <code>y3 = lambda*(x1 - x3) - y1</code>.</li>
            </ul>
            <p>The curve is <code>y^2 = x^3 + x + b</code> over <code>GF(2^64-59)</code>. The base point fixes <code>b</code>: <code>(2, 9)</code> gives <code>b = 81 - (8 + 2) = 71</code>. Scalar multiplication is left-to-right double-and-add and never touches <code>b</code>.</p>

            <h3>8.4 The Program It Runs</h3>
            <p>The bytecode assembled on <code>main</code>'s stack, in plaintext opcodes, is:</p>
            <pre><code class="language-text">A1  0x000000000ACE6D66      ; push r14  (clean scalar)
A1  0x0000000000000009      ; push 9
A1  0x0000000000000002      ; push r15  (clean base-point X)
A1  0x0000000000000000      ; push flag = 0  (finite point)
72                          ; Q = scalar * P
FF                          ; halt</code></pre>
            <p>Opcode <code>72</code> pops the four words, assembles <code>P = (2, 9)</code>, computes <code>Q = 0x0ACE6D66 * P</code>, and pushes <code>{flag, Q.x, Q.y}</code>. <code>main</code> then pops three times and keeps the <strong>second</strong> pop &mdash; <code>Q.x</code>. Evaluated by hand:</p>
            <pre><code class="language-python">p = 2**64 - 59
a = 1
def inv(x): return pow(x % p, p-2, p)
def add(P, Q):
    if P is None: return Q
    if Q is None: return P
    x1,y1 = P; x2,y2 = Q
    if x1 == x2:
        if (y1 + y2) % p == 0: return None
        l = ((3*x1*x1 + a) % p) * inv(2*y1) % p
    else:
        l = ((y2 - y1) % p) * inv(x2 - x1) % p
    x3 = (l*l - x1 - x2) % p
    return (x3, (l*(x1 - x3) - y1) % p)
def mul(k, P):
    R = None; Q = P
    while k:
        if k &amp; 1: R = add(R, Q)
        Q = add(Q, Q); k &gt;&gt;= 1
    return R

Q = mul(0x0ACE6D66, (2, 9))
# Q.x = 0xE1699E0C06577CD7</code></pre>
            <div class="flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-white/5 rounded-xl border border-white/5 my-6 w-full overflow-x-auto">
                <div class="text-sm sm:text-lg md:text-2xl lg:text-3xl font-mono font-bold text-green-400 tracking-tight sm:tracking-wide md:tracking-widest text-center mb-2 break-all whitespace-normal">ECC_result = Q.x = 0xE1699E0C06577CD7</div>
                <p class="text-xs text-text-muted mt-2">X-coordinate of 0x0ACE6D66 · (2,9) over y² = x³ + x + 71 mod (2⁶⁴−59)</p>
            </div>

            <h2>9. The Runtime-Assembled Validator</h2>
            <p><code>sub_14000C4D4(serial, ECC_result)</code> is the real gate. It does not contain the check &mdash; it manufactures it.</p>

            <h3>9.1 The Heap JIT</h3>
            <p>A builder allocates a small <code>RW</code> buffer with <code>VirtualAlloc</code>, writes machine code into it with a run of immediate stores, flips it to <code>EXECUTE_READ</code> with <code>VirtualProtect</code>, then hands it to the SMC encoder and the nanomite trampoline builder. Binary Ninja's decompiler renders the immediate stores as overlapping writes of mixed width; the raw assembler resolves them to a coherent body. With the embedded <code>ECC_result</code> as an immediate and <code>rcx</code> = the serial:</p>
            <pre><code class="language-x86asm">mov   r11, 0x7FFE0014        ; KUSER_SHARED_DATA.SystemTime
mov   r11d, dword [r11]      ; touch the shared page  &lt;-- anti-emulation mine
xor   r11d, r11d             ; discard it
fldpi                        ; \\
fsin                         ;  &gt; x87 dead weight, result never stored
fcos                         ; /
fstp  st0                    ; pop
mov   rax, rcx               ; rax = serial
mov   rdx, ECC_result        ; rdx = 0xE1699E0C06577CD7
mov   rsi, rax
or    rsi, rdx
and   rax, rdx
sub   rsi, rax               ; rsi = (s|e) - (s&amp;e) = s ^ e   == X
mov   rdi, rsi
mov   rax, 0x75A55AA512345678
xor   rdi, rax               ; rdi = X ^ K1
mov   r8,  rsi
mov   rdx, 0xECC8411076543210
and   r8,  rdx               ; r8  = X &amp; K2
add   rdi, r8                ; rdi = (X^K1) + (X&amp;K2)
mov   rdx, 0xDEADBEEFCAFEBABE
or    rsi, rdx               ; rsi = X | K3
sub   rdi, rsi               ; rdi = (X^K1) + (X&amp;K2) - (X|K3)
mov   rax, 0x96F79BB547359BBA
cmp   rdi, rax               ; == K4 ?
sete  al
movzx rax, al
ret</code></pre>
            <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm">
                <p class="text-yellow-400 font-bold mb-1"><i class="ph ph-warning"></i> Two Instructions of Pure Obstruction</p>
                <p class="text-gray-300"><code>mov r11d,[0x7FFE0014]</code> reads the user-shared-data page &mdash; present in every real Windows process, absent in a bare CPU emulator that maps only the image. A naive emulator faults with an unmapped read at <code>0x7FFE0014</code> the moment it steps in, which is why it is placed first. The <code>fldpi/fsin/fcos/fstp</code> block computes transcendental values and throws them away; it exists to drown constraint-based reasoning in terms that have no clean algebraic model, while contributing nothing to the result.</p>
            </div>
            <p>Strip the noise and the validator is one equation over 64-bit two's-complement arithmetic, with <code>X = serial ^ ECC_result</code>:</p>
            <pre><code class="language-text">(X ^ K1) + (X &amp; K2) - (X | K3) == K4
K1 = 0x75A55AA512345678   K3 = 0xDEADBEEFCAFEBABE
K2 = 0xECC8411076543210   K4 = 0x96F79BB547359BBA</code></pre>

            <h3>9.2 Trap-Flag Sliding-Window SMC</h3>
            <p>The builder does not leave that code in the clear. It calls an SMC encoder with a 21-element table:</p>
            <pre><code class="language-text">18 1B 25 28 2B 2E 31 34 3E 41 44 4E 51 54 5E 61 64 6E 71 74 78</code></pre>
            <p>Those are exactly the instruction-start offsets of the body decoded above. The table is the boundary map for a single-step engine: the vectored handlers from §6.6 walk the buffer one instruction at a time, decrypting the next instruction immediately before it executes and re-veiling the previous one, so a memory snapshot of the buffer at any instant shows at most one cleartext instruction. The 4-byte SMC key is <code>0x55AA55AA</code>.</p>
            <div class="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-sm">
                <p class="text-green-400 font-bold mb-1"><i class="ph ph-check-circle"></i> Independent Confirmation</p>
                <p class="text-gray-300">The exact match between the author's boundary table and the instruction offsets recovered from the raw assembler is the second, independent proof that the reconstructed body is the real instruction stream &mdash; not a coincidental decode of overlapping immediates.</p>
            </div>

            <h3>9.3 The UD2 Nanomite</h3>
            <p>The pointer actually returned to <code>sub_14000C4D4</code> starts with <code>0F 0B</code> &mdash; <code>UD2</code>. Calling it raises <code>#UD</code>, caught by the vectored exception handler, which redirects to the real validator body. There is no direct <code>call</code>/<code>jmp</code> edge into the validated code; the only way in is the fault. The buffer is <code>VirtualFree</code>'d with <code>MEM_RELEASE</code> afterwards so it never lingers.</p>

            <h3>9.4 Solving the Equation</h3>
            <p>The equation is one variable over 64 bit positions with carries. A linear carry DP over the bits enumerates the solution set; <code>X = 0</code> is a root because</p>
            <pre><code class="language-text">f(0) = K1 + 0 - K3 = 0x75A55AA512345678 - 0xDEADBEEFCAFEBABE
     = 0x96F79BB547359BBA = K4</code></pre>
            <p><code>X = 0</code> means <code>serial == ECC_result</code>. The full solution space has 2²² members (collisions from the mixed AND/OR/ADD structure), but only <code>X = 0</code> is the intended root: the entire VM and SMC apparatus exists to deliver <code>ECC_result</code> as the serial, and every other root is an arithmetic accident with no meaning.</p>
            <div class="flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-white/5 rounded-xl border border-white/5 my-6 w-full overflow-x-auto">
                <div class="text-sm sm:text-lg md:text-2xl lg:text-3xl font-mono font-bold text-green-400 tracking-tight sm:tracking-wide md:tracking-widest text-center mb-2 break-all whitespace-normal">SERIAL = E1699E0C06577CD7</div>
                <p class="text-xs text-text-muted mt-2">serial = ECC_result = Q.x &mdash; supply as bare hex, no 0x prefix</p>
            </div>
            <p>The hex parser in <code>main</code> is worth a note: it shifts <code>&lt;&lt;4</code> per character and OR-s the nibble only for <code>0-9 / a-f / A-F</code>. Any other character still shifts but contributes nothing, so a <code>0x</code> prefix silently corrupts the value. The serial must be supplied as bare hex.</p>

            <h2>10. The Cross-Process Scanner</h2>
            <p>The serial gate is only half the program. The other half explains the <code>&lt;PID|ProcessName&gt; &lt;TargetString&gt;</code> arguments. Once the serial passes and the target process is open, <code>main</code> decrypts <code>.ouro</code> in place with a 4-byte XOR whose key is <code>ECC_result ^ 0x55AA55AA</code> &mdash; so the scanner only decrypts correctly when the EC math ran on a clean host &mdash; then spawns a worker with a context of <code>{ handle, target_string, serial ^ 0x55AA55AA, ntdll_routine }</code>.</p>
            <p>The decrypted routine is a full user-space sweep: <code>NtQueryVirtualMemory</code> walking <code>0 → 0x7FFFFFFF0000</code> region by region, committed regions read in <code>0x10000</code> chunks via <code>NtReadVirtualMemory</code>, each chunk searched for the target string in both ANSI and UTF-16, and on a hit the surrounding bytes are driven back through the EC VM (the <code>E5/E6/E7</code> external opcodes issue further direct syscalls against the target). It is the binary reaching into another process's address space, gated behind the serial so the scanner cannot even be reached without first solving the curve.</p>

            <h2>11. Persistent Success Token</h2>
            <p>The <code>DONE</code> value is not a constant in the image. A <code>0x38</code>-byte blob is registered and turned into a guarded page (<code>PAGE_GUARD</code> set) so any stray read of it trips an exception routed through the vectored handlers. The token is only ever materialised inside a tight window: the blob is decrypted into a stack buffer with the <code>0x55AA55AA</code> key, the value at offset <code>0x2C</code> is taken and XORed with <code>0x1337BEEF</code>, and the blob is immediately re-veiled. On the passing path this token is non-zero and is what <code>printf("0x%X -&gt; DONE", token)</code> reports &mdash; observed as <code>0xACE00100</code>, an echo of the <code>0x0ACE6D66</code> curve scalar. On any failing path the slot is zero and <code>main</code> returns <code>0xBADC0DE</code>.</p>

            <h2>12. The Silent-Run Defect</h2>
            <p>Running the binary with the correct serial from a shell produced <strong>no output at all</strong> and an exit code of <code>0xDEAD</code> (57005). That exit value appears in exactly one place &mdash; the early <code>printf</code> resolution guard:</p>
            <pre><code class="language-c">crt = resolve_module(msvcrt) ?: resolve_module(ucrtbase);
if (crt) g_printf = resolve_export(crt, hash_printf);
if (!g_printf) return 0xDEAD;</code></pre>
            <p>Two facts close it out. First, <code>printf</code> is resolved from <code>msvcrt.dll</code>, with <code>ucrtbase.dll</code> as the fallback &mdash; and <code>ucrtbase.dll</code> does not export <code>printf</code> by name (it ships <code>__stdio_common_vfprintf</code>; <code>printf</code> is an inline in the static UCRT). Parsing both export tables confirms it: <code>printf</code> is present in <code>msvcrt.dll</code> (djb2 <code>0x156B2BB8</code>, which is <code>0x065C9557 ^ 0x1337BEEF</code>) and absent from <code>ucrtbase.dll</code>. Second, this image is statically linked against the UCRT, so it imports neither CRT DLL; the PEB walk only <em>reads</em> the loader list, it never <em>loads</em> anything.</p>
            <p>A module sweep of the live process shows what is mapped when <code>main</code> runs:</p>
            <pre><code class="language-text">jormungandr.exe  ntdll.dll  kernel32.dll  kernelbase.dll
kernel.appcore.dll  rpcrt4.dll  msvcrt.dll
exit code: 0xDEAD   (msvcrt loaded? True   ucrtbase loaded? False)</code></pre>
            <p><code>msvcrt.dll</code> does end up in the process &mdash; pulled in transitively through <code>rpcrt4</code> / <code>kernel.appcore</code> &mdash; but it is mapped <em>after</em> <code>main</code> has already done its <code>printf</code> lookup and bailed with <code>0xDEAD</code>. The resolver loses a race against the loader on this host configuration.</p>
            <p>The fix guarantees <code>msvcrt.dll</code> is resident before <code>main</code> executes, without touching a single byte of the image. Create the process suspended, force the load from outside, then resume:</p>
            <pre><code class="language-python">CreateProcessW(exe, cmdline, ..., CREATE_SUSPENDED, ..., &amp;pi)
p  = VirtualAllocEx(pi.hProcess, None, len(b"msvcrt.dll\\0"), MEM_COMMIT, PAGE_RW)
WriteProcessMemory(pi.hProcess, p, b"msvcrt.dll\\0")
ll = GetProcAddress(GetModuleHandle("kernel32.dll"), "LoadLibraryA")
h  = CreateRemoteThread(pi.hProcess, None, 0, ll, p, 0, None)
WaitForSingleObject(h, INFINITE)     # msvcrt mapped before main runs
ResumeThread(pi.hThread)</code></pre>
            <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm">
                <p class="text-blue-400 font-bold mb-1"><i class="ph ph-key"></i> Why This Also Beats the Anti-Debug</p>
                <p class="text-gray-300">A single remote <code>LoadLibrary</code> is not a debugger: no <code>DebugActiveProcess</code>, no thread suspension of the analysis kind the watchdog detects, no PEB flip. And the launcher itself becomes the parent &mdash; one that is not on the five-entry blacklist &mdash; so the parent-process gate is skipped for free. The loader solves the missing-<code>printf</code> race and walks past §6.3 in the same motion.</p>
            </div>

            <h2>13. Final Output</h2>
            <p>Clean launch, correct serial, no instrumentation:</p>
            <pre><code class="language-text">[launch] pid=14280  cmdline="...\\jormungandr.exe" 3404 DENEME E1699E0C06577CD7
[inject] msvcrt.dll force-loaded into child before main
SEED: 0x7E51
0xACE00100 -&gt; DONE
[exit] code = 0 (0x0)</code></pre>
            <div class="flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-white/5 rounded-xl border border-white/5 my-6 w-full overflow-x-auto">
                <div class="text-sm sm:text-lg md:text-2xl font-mono font-bold text-green-400 tracking-tight sm:tracking-wide md:tracking-widest text-center mb-2 break-all whitespace-normal">0xACE00100 -&gt; DONE</div>
                <p class="text-xs text-text-muted mt-2">Real banner, exit code 0, no delayed crash &mdash; not the 0x1337 decoy</p>
            </div>
            <p>The banner reports <code>0xACE00100</code>, not the decoy's <code>0x1337</code>; the exit code is <code>0</code>, not <code>0xBADC0DE</code> or <code>0xDEAD</code>; and there is no delayed fault. Every stage corroborates the static reconstruction: the curve point <code>Q = 0x0ACE6D66 * (2, 9)</code> yields <code>Q.x = 0xE1699E0C06577CD7</code>, the JIT validator collapses to <code>serial == Q.x</code>, and the persistent token is released only on that path.</p>

            <h2>14. Objective Map</h2>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Objective</th>
                            <th class="py-2 font-mono uppercase text-xs">Result</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-2">Pass parent-process &amp; hypervisor gates cleanly</td><td class="py-2">Parent gate is a basename-hash blacklist (explorer/cmd/powershell/devenv/+1); a non-listed parent skips it. The CPUID VM-exit latency and DR/timing checks poison the curve inputs rather than branch, so the answer is recovered statically and run on bare metal.</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">Find the un-mutated serial, print the token</td><td class="py-2 text-green-400 font-mono">E1699E0C06577CD7 → 0xACE00100 -&gt; DONE, exit 0</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">Defeat the trap-flag SMC, recover JIT plaintext</td><td class="py-2">Boundary table + 0x55AA55AA window reconstructed; validator recovered byte-for-byte.</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">Bypass the shared-page check and FPU traps</td><td class="py-2">0x7FFE0014 read and fldpi/fsin/fcos identified as dead weight; the check reduces to one 64-bit equation.</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">Solve the elliptic-curve math</td><td class="py-2">y² = x³ + x + 71 over GF(2⁶⁴−59), base (2,9), scalar 0x0ACE6D66; result X-coordinate is the serial.</td></tr>
                    </tbody>
                </table>
            </div>

            <h2>15. Key Functions Reference</h2>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Address</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Label</th>
                            <th class="py-2 font-mono uppercase text-xs">Role</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x140009940</td><td class="py-2">main</td><td class="py-2">Spine: init, anti-debug, EC eval, decoy, real check, scanner spawn</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000A774</td><td class="py-2">resolve_module</td><td class="py-2">PEB BaseDllName djb2 walk</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000A7DC</td><td class="py-2">resolve_export</td><td class="py-2">Export-directory djb2 walk</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000A934</td><td class="py-2">djb2</td><td class="py-2">hash = hash*0x21 + c, seed 0x1505</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x1400096E8</td><td class="py-2">parent_check</td><td class="py-2">Parent image-name hash blacklist</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000ACF4</td><td class="py-2">watchdog</td><td class="py-2">Timing + DR0–DR3 hardware-breakpoint detection</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000BB84</td><td class="py-2">vm_init</td><td class="py-2">Build VM context + opcode permutation</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000B43C</td><td class="py-2">vm_run</td><td class="py-2">Stack VM dispatcher</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000AF78</td><td class="py-2">ec_add</td><td class="py-2">EC point add/double, a=1</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000B21C</td><td class="py-2">ec_mul</td><td class="py-2">EC scalar multiply (double-and-add)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000B364</td><td class="py-2">mulmod</td><td class="py-2">Russian-peasant multiply mod p</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000BEBC</td><td class="py-2">jit_build</td><td class="py-2">Heap-assemble the validator body</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000BDE8</td><td class="py-2">smc_xor</td><td class="py-2">4-byte XOR decrypt + FlushInstructionCache</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000C4D4</td><td class="py-2">real_validator</td><td class="py-2">Build JIT, call via UD2, free, return verdict</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14001C000</td><td class="py-2">scanner (.ouro)</td><td class="py-2">Cross-process memory sweep, EC-fed</td></tr>
                    </tbody>
                </table>
            </div>

            <h2>16. Closing Note</h2>
            <p>Jörmungandr is a tight piece of work. There is no commercial packer and no million-instruction VM &mdash; the whole image is ~122 KB &mdash; yet it resists every shortcut. A debugger poisons the curve scalar through an <code>INT3</code> scan and a DR-register watchdog. An emulator faults on the <code>KUSER_SHARED_DATA</code> read before it reaches the first comparison. A symbolic solver chokes on <code>fsin</code>/<code>fcos</code> that feed nothing. A patcher finds no branch to flip, because the protection encodes its answer as arithmetic, not control flow. And anyone who greps for a stored serial finds only the decoy's banner and a 30-second fuse.</p>
            <p>The intended path is the only path: read the curve out of the VM, recognise that the heap-JIT collapses to <code>serial == Q.x</code>, and compute <code>0x0ACE6D66 * (2, 9)</code> over <code>GF(2^64-59)</code> by hand. The serial is the curve. The curve is the key. The key unlocks the scanner. The serpent's tail meets its mouth, and the binary prints what it was always going to print.</p>

            <div class="mt-12 text-center">
                <p class="text-xl text-white font-bold mb-2">Serial: <code class="text-green-400">E1699E0C06577CD7</code></p>
                <p class="text-xl text-white font-bold mb-2">Decoy (avoid): <code class="text-green-400">1331D66091E9E2E5</code></p>
                <p class="text-xl text-white font-bold mb-2">Token: <code class="text-green-400">0xACE00100 -&gt; DONE</code></p>
                <p class="text-text-muted italic">dr4gan &mdash; June 2026</p>
            </div>
        </div>
    `
});
