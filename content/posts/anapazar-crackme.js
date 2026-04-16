/**
 * Post: ANAPAZAR CrackMe — Defeating VMProtect 3.x Through Algebraic Seed Recovery
 * Category: Reverse Engineering
 */

window.Dr4ganData.posts.push({
    id: "anapazar-crackme",
    title: "ANAPAZAR CrackMe — VMProtect 3.x, a Custom VM, and an Algebraic Splitmix Recovery",
    date: "04/16/2026",
    category: "Reverse Engineering",
    tags: ["CrackMe", "PE64", "Windows", "VMProtect", "Custom VM", "ECDSA", "Splitmix32", "Anti-Debug", "Anti-Tamper", "TLS Callback", "Runtime Patch", "Binary Ninja", "x64dbg"],
    description: "A VMProtect 3.x packed CrackMe wrapped around a 28-opcode custom VM, manual ECDSA-P256, 16 anti-debug vectors, and nine decoy strings planted to waste analyst time. The real success path was extracted by inverting two splitmix32 hashes algebraically — producing a single 32-bit magic seed that unlocks the author-intended '[+] GG, crackme tamam.' banner and a deterministic proof line. Full crack in 16 bytes of runtime patch.",
    image: null,
    content: `
        <div class="space-y-8">
            <!-- Metadata Block -->
            <div class="bg-white/[0.03] p-4 md:p-6 rounded-xl border border-white/5 font-mono text-xs sm:text-sm space-y-3">
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Target</span>
                    <span class="text-white break-words">ANAPAZAR CrackMe (crackme.exe)</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Platform</span>
                    <span class="text-white break-words">PE64 / x86-64 / Windows 10</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Size</span>
                    <span class="text-white break-words">~27 MB on disk / ~45 MB in memory</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Protection</span>
                    <span class="text-white break-words">VMProtect 3.x + Custom VM (28 opcodes) + ECDSA-P256 + 16 Anti-Debug + Anti-Tamper + SMC + TLS Callback</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Tooling</span>
                    <span class="text-white break-words">Binary Ninja 5.2 (HLIL / MLIL / LLIL), x64dbg, Capstone, Python 3</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 pt-1">
                    <span class="text-text-muted">Result</span>
                    <span class="text-green-400 font-bold tracking-wider break-words">MAGIC_SEED_RECOVERED + 16B_RUNTIME_PATCH</span>
                </div>
            </div>

            <h2>1. Target Overview</h2>
            <p>The target is <code>crackme.exe</code>, distributed as a standalone 64-bit Windows console executable. The challenge is blunt: a banner, a machine-specific identifier, an input prompt, and a verdict.</p>
            <pre><code class="language-text">  ====================================
        ANAPAZAR Crackme
  ====================================

  Machine ID: 0xDC4B

  Keyi girin > test

  [-] Yanlis key. Tekrar dene.</code></pre>
            <p>The author's brief warned the reader up front: every surface of this binary is instrumented with honeypots. Success banners, crypto API references, license file paths, HTTP endpoints — all planted to mislead. The actual success message is hidden. My job was to surface the real verification path without tripping any of the decoys.</p>

            <h2>2. Initial Reconnaissance</h2>

            <h3>2.1 PE Header</h3>
            <p>Parsing the PE header directly with a small Python helper on top of <code>pefile</code>:</p>
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
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">AddressOfEntryPoint</td><td class="py-2"><code>0x010ADC1C</code></td><td class="py-2 text-red-400">Inside packed blob, not in <code>.text</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">SizeOfImage</td><td class="py-2"><code>0x02BA6000</code></td><td class="py-2">~45 MB mapped</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">SizeOfCode</td><td class="py-2"><code>0x0000E000</code></td><td class="py-2">Declared code size (misleading)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">DllCharacteristics</td><td class="py-2"><code>0x8120</code></td><td class="py-2">HIGH_ENTROPY_VA, DYNAMIC_BASE, NX, TERMINAL_AWARE</td></tr>
                    </tbody>
                </table>
            </div>

            <h3>2.2 Section Table</h3>
            <p>Eight sections, mostly empty on disk:</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">#</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Name</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">VAddr</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">VSize</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">RawSize</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Entropy</th>
                            <th class="py-2 font-mono uppercase text-xs">Note</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1">0</td><td class="py-1 font-mono">.text</td><td class="py-1"><code>0x1000</code></td><td class="py-1"><code>0xDE11</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">&mdash;</td><td class="py-1">Code &mdash; empty on disk</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">1</td><td class="py-1 font-mono">.rdata</td><td class="py-1"><code>0xF000</code></td><td class="py-1"><code>0x654A</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">&mdash;</td><td class="py-1">R-only data &mdash; empty</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">2</td><td class="py-1 font-mono">.data</td><td class="py-1"><code>0x16000</code></td><td class="py-1"><code>0xF10</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">&mdash;</td><td class="py-1">Initialized data &mdash; empty</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">3</td><td class="py-1 font-mono">.pdata</td><td class="py-1"><code>0x17000</code></td><td class="py-1"><code>0x990</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">&mdash;</td><td class="py-1">Exception directory &mdash; empty</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">4</td><td class="py-1 font-mono">.CNj</td><td class="py-1"><code>0x18000</code></td><td class="py-1"><code>0x106AFC6</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">&mdash;</td><td class="py-1">16.4 MB virtualized-code reserve</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">5</td><td class="py-1 font-mono">.+Cl</td><td class="py-1"><code>0x1083000</code></td><td class="py-1"><code>0x120</code></td><td class="py-1"><code>0x200</code></td><td class="py-1">1.08</td><td class="py-1 text-yellow-400">Rebuilt IAT</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">6</td><td class="py-1 font-mono">.Sd~</td><td class="py-1"><code>0x1084000</code></td><td class="py-1"><code>0x1B20B28</code></td><td class="py-1 text-green-400"><code>0x1B20C00</code></td><td class="py-1 text-green-400 font-bold">7.723</td><td class="py-1">Packed/encrypted blob (27 MB)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">7</td><td class="py-1 font-mono">.rsrc</td><td class="py-1"><code>0x2BA5000</code></td><td class="py-1"><code>0x1D5</code></td><td class="py-1"><code>0x200</code></td><td class="py-1">4.73</td><td class="py-1">Manifest</td></tr>
                    </tbody>
                </table>
            </div>
            <p>Four standard sections (<code>.text</code>, <code>.rdata</code>, <code>.data</code>, <code>.pdata</code>) have <code>SizeOfRawData = 0</code>. The entry point at RVA <code>0x010ADC1C</code> falls inside <code>.Sd~</code>. The custom-named sections and the 7.723 entropy of <code>.Sd~</code> across its full 27 MB are a signature of a commercial packer, and the IAT-rebuild section <code>.+Cl</code> (only 14 thunks) is a classic VMProtect tell.</p>

            <h3>2.3 Section-Name Trust &mdash; Cross-Check</h3>
            <p>Section names alone prove nothing. A section named <code>.Sd~</code> could be any packer, or none. The protector fingerprint was confirmed by six independent signals:</p>
            <ol>
                <li><strong>Entry point inside <code>.Sd~</code></strong>, not in <code>.text</code></li>
                <li><strong>All standard sections have <code>RawSize = 0</code></strong> &mdash; code and data stripped from the file</li>
                <li><strong>Uniform 7.99 block entropy across 27 MB</strong> &mdash; single encrypted/compressed stream, no internal boundaries</li>
                <li><strong>IAT relocated to a separate tiny section (<code>.+Cl</code>, 14 thunks)</strong> &mdash; VMP signature behaviour</li>
                <li><strong>TLS directory present</strong> with <code>AddressOfCallBacks = 0</code> &mdash; callbacks patched in at runtime (VMP's late-bind trick)</li>
                <li><strong>Exception directory 0x3288 bytes</strong> &mdash; oversized relative to section count, consistent with VMP runtime stubs</li>
            </ol>
            <p>Detect It Easy classifies it as VMProtect 3.x, but DiE alone is spoofable. The six signals above collectively confirm VMProtect 3.x.</p>

            <h3>2.4 Import Table</h3>
            <p>Fourteen imports total, exactly one function per DLL &mdash; another VMP marker. The runtime resolves the rest through its own loader after unpacking.</p>
            <div class="bg-[#0a0a0a] p-4 rounded-lg border border-white/5 font-mono text-xs sm:text-sm space-y-1">
                <p><code>bcrypt.dll</code> &rarr; <strong class="text-yellow-400">BCryptVerifySignature</strong> <span class="text-text-muted">// flagged for later</span></p>
                <p><code>KERNEL32.dll</code> &rarr; GetCurrentThreadId</p>
                <p><code>USER32.dll</code> &rarr; IsWindowVisible</p>
                <p><code>ADVAPI32.dll</code> &rarr; SetKernelObjectSecurity</p>
                <p><code>MSVCP140.dll</code> &rarr; basic_streambuf::sputn</p>
                <p><code>VCRUNTIME140_1.dll</code> &rarr; __CxxFrameHandler4</p>
                <p><code>VCRUNTIME140.dll</code> &rarr; memset</p>
                <p><code>ntdll.dll</code> &rarr; RtlCaptureContext</p>
                <p><span class="text-text-muted">&hellip; 6 more from api-ms-win-crt</span></p>
            </div>
            <p>The single <code>bcrypt.dll</code> import pinned my attention. If the author is doing real ECDSA-P256 validation through CNG, this is where it shows up. I filed it and kept going.</p>

            <h2>3. Environment and Toolchain</h2>
            <p>All primary static analysis ran in Binary Ninja 5.2 on a fresh database loaded from a live process snapshot (explained in §4). Dynamic triage and memory capture ran under x64dbg only when I needed to confirm a runtime state.</p>
            <ul>
                <li><strong>Binary Ninja 5.2</strong> &mdash; HLIL / MLIL / LLIL decompilation and cross-references on the dumped image</li>
                <li><strong>x64dbg</strong> &mdash; runtime verification, memory map inspection, ground-truth for one-off address checks</li>
                <li><strong>Capstone (Python bindings)</strong> &mdash; bulk disassembly over every RX region of the dump for xref discovery and pattern scans</li>
                <li><strong>Python 3</strong> &mdash; PE parsing, algebraic solving, and the final runtime patcher</li>
                <li><strong>Detect It Easy</strong> &mdash; first-pass packer identification (cross-checked against six independent structural signals, not trusted in isolation)</li>
            </ul>

            <h2>4. Stage 0 &mdash; Unpacking Strategy</h2>
            <p>Modern VMProtect 3.x cannot be statically unpacked in any reasonable timeframe. The packed blob at <code>.Sd~</code> is a single contiguous encrypted/compressed stream; entropy is uniform across all 27 MB with no boundaries to attack. Writing a VMP unpacker from scratch is days of work; that isn't how you approach a CrackMe.</p>
            <p>The practical route is the same as for Themida-protected binaries: <strong>let the packer do the work, then capture the result</strong>. Once the program reaches its stdin read, every function the protected main path touches has been decrypted into the <code>.text</code> / <code>.rdata</code> virtual ranges. At that point a plain memory snapshot of the process yields a fully analyzable image.</p>
            <p>Rather than attach a debugger (which sixteen different anti-debug checks are waiting for), I wrote a passive memory capture:</p>
            <ul>
                <li>Spawn <code>crackme.exe</code> as a child process with stdin/stdout pipes</li>
                <li>Wait for the <code>Keyi girin</code> prompt bytes to arrive on stdout &mdash; guarantees the verifier path is unpacked</li>
                <li>Open the process with <code>PROCESS_VM_READ | PROCESS_QUERY_INFORMATION</code></li>
                <li>Walk the address space with <code>VirtualQueryEx</code>; for every <code>MEM_COMMIT</code> readable region, pull bytes with <code>ReadProcessMemory</code></li>
                <li>Serialise to a self-describing snapshot file (header, region index, raw bytes)</li>
            </ul>
            <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm">
                <p class="text-blue-400 font-bold mb-1"><i class="ph ph-key"></i> Why This Beats Every Anti-Debug</p>
                <p class="text-gray-300">VMP's anti-debug vectors detect <em>debuggers</em>: <code>PEB.BeingDebugged</code>, <code>NtQueryInformationProcess.ProcessDebugPort</code>, hardware breakpoints, timing anomalies via <code>RDTSC</code>, SEH/VEH probes, and so on. A passive <code>OpenProcess + ReadProcessMemory</code> from a sibling user-mode process is none of those. There is no <code>DebugActiveProcess</code>, no thread suspension, no single-step. The target's PEB never flips. All sixteen checks silently pass.</p>
            </div>
            <p>The snapshot produced 152 committed regions, ~62 MB total. Binary Ninja was then pointed at the reconstructed image for static analysis.</p>

            <h2>5. Unpacked .rdata Triage &mdash; The Honeypot Garden</h2>
            <p>With the snapshot loaded, the unpacked <code>.rdata</code> at <code>0x14000F000</code>&ndash;<code>0x14001554A</code> became readable. A string scan over that range surfaced an entire theatre set:</p>

            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Address</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">String</th>
                            <th class="py-2 font-mono uppercase text-xs">Xrefs</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000F688</code></td><td class="py-1">"License check passed, unlocking premium features..."</td><td class="py-1 text-red-400 font-bold">0</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000F6C0</code></td><td class="py-1">"SELECT license_key FROM users WHERE hwid = ?"</td><td class="py-1 text-red-400 font-bold">0</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000F6F0</code></td><td class="py-1">"AES256_decrypt(key, iv, ciphertext)"</td><td class="py-1 text-red-400 font-bold">0</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000F718</code></td><td class="py-1">"HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run"</td><td class="py-1 text-red-400 font-bold">0</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000F750</code></td><td class="py-1">"POST /api/v2/license/activate HTTP/1.1"</td><td class="py-1 text-red-400 font-bold">0</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000F798</code></td><td class="py-1">"-----BEGIN RSA PRIVATE KEY-----"</td><td class="py-1 text-red-400 font-bold">0</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000F7B8</code></td><td class="py-1">"MIIEpA..."</td><td class="py-1 text-red-400 font-bold">0</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000F7C8</code></td><td class="py-1">"api.licensing-server.com"</td><td class="py-1 text-red-400 font-bold">0</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000F7E8</code></td><td class="py-1">"license.dat"</td><td class="py-1 text-red-400 font-bold">0</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000F7F8</code></td><td class="py-1">"trial_expired=false&amp;premium=true"</td><td class="py-1 text-red-400 font-bold">0</td></tr>
                    </tbody>
                </table>
            </div>

            <p>Every one of these strings has <strong>zero</strong> cross-references anywhere in the unpacked executable region. A Python Capstone scan over every RX page looking for <code>48 8D XX ?? ?? ?? ??</code> (LEA with RIP-relative displacement) against each string's virtual address returned an empty set. None of this data is ever loaded by any instruction.</p>
            <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm">
                <p class="text-yellow-400 font-bold mb-1"><i class="ph ph-warning"></i> Honeypot Verdict</p>
                <p class="text-gray-300">SQL injection, HTTP POST to a licensing server, embedded RSA private key, a registry persistence path, a fake AES-256 reference string &mdash; all planted to catch an analyst who greps the <code>.rdata</code> section and starts chasing pseudo-leads. They burn nothing at runtime and they point nowhere.</p>
            </div>

            <h3>5.1 The Real Success Format</h3>
            <p>Among the same string pool, one format string stood out:</p>
            <pre><code class="language-text">0x14000F938   "  Machine ID: 0x%04X"          // 1 xref  (banner print path)
0x14000F960   "  Proof: %04X-%04X-%04X-%04X"  // 1 xref  (success path)</code></pre>
            <p>The Proof format string has exactly one xref, from <code>0x14000BE50</code>. Walking back from that reference in Binary Ninja located the enclosing function at <code>0x14000BC70</code> &mdash; this is the success printer. It has exactly one caller too, at <code>0x14000D1A1</code>. One xref in, one xref out. The entire success path fans from these two addresses.</p>

            <h2>6. Anti-Debug Surface</h2>

            <h3>6.1 Dynamic API Resolution Table</h3>
            <p>The same string pool holds the names of the APIs the CrackMe plans to resolve by hand at runtime, bypassing the import table entirely:</p>
            <pre><code class="language-text">0x14000F5F0   "NtQueryInformationProcess"
0x14000F610   "NtSetInformationThread"
0x14000F630   "NtQuerySystemInformation"
0x14000F650   "NtClose"
0x14000F658   "NtYieldExecution"
0x14000F670   "NtSetInformationProcess"
0x14000F820   "ntdll.dll"
0x14000F830   "IsDebuggerPresent"
0x14000F848   "kernel32.dll"
0x14000F860   "CheckRemoteDebuggerPresent"
0x14000F880   "GetThreadContext"
0x14000F898   "VirtualProtect"
0x14000F8A8   "EtwEventWrite"</code></pre>
            <p>The resolver itself sits at <code>0x1400055B0</code> &mdash; a two-argument function taking a <code>(dll_name, func_name)</code> pair. The caller at <code>0x1400059B0</code> issues seven back-to-back calls to populate the dynamic dispatch table. These are the classic sixteen-vector anti-debug set: <code>ProcessDebugPort</code>, <code>ProcessDebugFlags</code>, <code>ProcessDebugObjectHandle</code>, <code>HideThreadFromDebugger</code>, <code>SystemKernelDebuggerInformation</code>, debug-handle probing, <code>CheckRemoteDebuggerPresent</code>, <code>PEB.BeingDebugged</code>, and so on.</p>

            <h3>6.2 Module-Name Hash Check</h3>
            <p>At <code>0x140005A50</code> a small function hashes loaded module names with a DJB2 variant (<code>hash = hash * 0x21 + char</code>, seed <code>0x1505</code>) and compares against a six-entry table at <code>0x14000FCE0</code>. Standard anti-analysis: kills the process if anything named like a known debugger, sandbox, or tracing tool is in the module list.</p>

            <h3>6.3 Anti-Tamper Decoys</h3>
            <p>Throughout the verifier chain, every few blocks emit an <code>RDTSC</code>-based timing probe followed by conditional writes to <code>.data</code> globals holding sentinel values:</p>
            <pre><code class="language-x86asm">rdtsc
shl  rdx, 0x20
or   rax, rdx
mov  [rsp+0x38], rax
mov  rax, [rsp+0x38]
mov  rcx, [rsp+0x38]
imul ecx, eax
mov  rax, [rsp+0x38]
add  eax, ecx
test al, 1
je   skip
mov  dword ptr [rip+0xAD5C], 0xF00DCAFE     ; canary</code></pre>
            <p>There are dozens of these scattered across the hash and verifier functions, writing <code>0xF00DCAFE</code>, <code>0xCAFEBABE</code>, <code>0xDEADBEEF</code> to various <code>.data</code> slots. At first glance they look like anti-tamper canaries: if timing is anomalous (e.g. under single-step), the canary gets flipped and some later check fails.</p>
            <p>Closer inspection shows that only <strong>one</strong> of these globals is actually consumed by the success/fail discriminator (a 16-bit word at <code>0x140016D2C</code>, §10). The rest are decoys. In a clean run their values are never read. They exist to drown any analyst who assumes every canary is load-bearing in a maze of unused state.</p>

            <h2>7. The BCryptVerifySignature Bait</h2>
            <p>The single <code>bcrypt.dll</code> import demanded verification. If ECDSA-P256 is being done through CNG, there must be a call site. A Capstone sweep over every executable region in the snapshot &mdash; looking for any <code>call [rip+disp]</code> or <code>call imm</code> targeting either the IAT thunk (<code>0x141083000</code>) or the resolved runtime address of <code>BCryptVerifySignature</code> inside <code>bcrypt.dll</code> &mdash; came back empty.</p>
            <pre><code class="language-text">[*] Scanning all executable regions for calls to IAT[BCryptVerifySignature]
[*] Scanning all executable regions for calls to runtime address 0x7FFDABBF2AC0
[-] 0 xrefs (IAT slot)
[-] 0 xrefs (runtime addr, globally)</code></pre>
            <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm">
                <p class="text-red-400 font-bold mb-1"><i class="ph ph-shield-warning"></i> Import as Decoration</p>
                <p class="text-gray-300">The <code>BCryptVerifySignature</code> import is <strong>never called</strong>. It exists in the import table to advertise ECDSA-P256 usage and anchor an analyst's attention on CNG API hooking. The real ECDSA is implemented by hand inside the custom VM dispatcher at <code>0x140009080</code>, using arbitrary-precision integer math over P-256 curve parameters.</p>
            </div>
            <p>Hooking <code>BCryptVerifySignature</code> &mdash; the first reflex when you see it in the IAT &mdash; does nothing. The import is a billboard.</p>

            <h2>8. Key Parser and Format Gate</h2>
            <p>The input parser lives around <code>0x14000AC03</code>. Reconstruction from HLIL:</p>
            <pre><code class="language-c">// Pseudocode of 0x14000AC03 .. 0x14000AF00
if (strcmp_prefix(input, "ANAPAZAR-LICENSE-V1") != 0) goto fail;  // 0x14000AC0F
if (strlen(input) != 0x13) goto fail;                              // 19 chars
if (input[0x04] != '-')    goto fail;
if (input[0x09] != '-')    goto fail;
if (input[0x0E] != '-')    goto fail;

// Groups parsed as 4 hex chars each (2 bytes per group)
for (i = 0; i &lt; 4; i++) {
    hi = hex2nib(input[5*i + 0]);
    lo = hex2nib(input[5*i + 1]);
    if (hi &lt; 0 || lo &lt; 0) goto fail;
    key[2*i + 0] = (hi &lt;&lt; 4) | lo;
    hi = hex2nib(input[5*i + 2]);
    lo = hex2nib(input[5*i + 3]);
    if (hi &lt; 0 || lo &lt; 0) goto fail;
    key[2*i + 1] = (hi &lt;&lt; 4) | lo;
}
// key[] is now 8 bytes, big-endian packed</code></pre>
            <p>The failure target is <code>0x14000B053</code>. Seventeen conditional branches funnel into it, all from within the parser &mdash; they're all form-level gates (prefix, length, separators, hex parse). The real cryptographic failure reaches the same label through a different route, §10.</p>

            <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm">
                <p class="text-blue-400 font-bold mb-1"><i class="ph ph-key"></i> Key Format</p>
                <p class="text-gray-300"><strong>XXXX-XXXX-XXXX-XXXX</strong> &mdash; 19 characters, 3 dashes at fixed positions, four 4-hex-digit groups decoding to 8 bytes of binary material. The prefix <code>ANAPAZAR-LICENSE-V1</code> appears to be a context label the parser uses as a salt in the VM dispatch (not an input prefix from the user).</p>
            </div>

            <h2>9. "Yanlis key" &mdash; Stored as Ciphertext</h2>
            <p>A plaintext scan of the entire crackme module for the literal strings <code>"Yanlis"</code>, <code>"Tekrar"</code>, <code>"Dogru"</code>, <code>"Tebrikler"</code>, <code>"GG"</code>, <code>"basari"</code>, and variants returned zero hits. The failure message that the binary prints visibly to the user does not exist as plaintext anywhere in the process image.</p>
            <p>Both the failure message ("[-] Yanlis key. Tekrar dene.") and the success banner are stored as small byte arrays XOR-masked against a splitmix32 keystream derived from a seed, and decoded byte-by-byte just before they're handed to <code>std::cout</code>. The decryption constants are inlined as immediates in the print function's prologue, e.g. at <code>0x14000BCCE</code>:</p>
            <pre><code class="language-x86asm">mov    eax, edi
xor    eax, 0x7A3B9E1D
imul   ecx, eax, 0x31415927
; ... splitmix32 mangle ...
xor    al, 0xB4
mov    [rbp-0x19], al     ; first byte of decoded banner
; ... 26 more bytes with different post-xor constants ...</code></pre>
            <p>Recovering the real success banner would require the correct <code>edi</code> value. Which is what §12 solves algebraically.</p>

            <h2>10. main() &mdash; The Discriminator Chain</h2>
            <p>The only caller of the success printer (<code>0x14000BC70</code>) sits at <code>0x14000D1A1</code>, inside a function that handles the whole key-check sequence. The interesting range is <code>0x14000D082</code>&ndash;<code>0x14000D1A6</code>.</p>

            <h3>10.1 Seed Build-Up</h3>
            <pre><code class="language-x86asm">0x14000D082:  call 0x140004880           ; init / tamper-check
0x14000D087:  call 0x140001750           ; (further init)
0x14000D08C:  call 0x140004E00           ; (further init)
0x14000D091:  lea  rcx, [rbp-0x79]       ; rcx = user key buffer
0x14000D09F:  call 0x140009080           ; VM verifier (ECDSA + dispatch)
0x14000D0A4:  mov  esi, [rip+0x9C7E]     ; esi = .data global
0x14000D0AA:  xor  esi, eax              ; esi ^= verifier_return
0x14000D0AC:  call 0x14000C370           ; g()
0x14000D0B1:  xor  esi, eax              ; esi ^= g_return</code></pre>
            <p>After <code>0x14000D0B1</code>, <code>esi</code> holds the <em>seed</em>. For the correct key, <code>esi</code> equals a specific 32-bit constant the verifier produces; for a wrong key, it's garbage. Everything downstream funnels through <code>esi</code>.</p>

            <h3>10.2 Five Hash Checks</h3>
            <p>Between <code>0x14000D0FC</code> and <code>0x14000D15C</code>, the function issues five calls to two internal hash routines, XORs each return value with a hardcoded constant, and stores the result on the stack:</p>
            <pre><code class="language-x86asm">0x14000D0FC:  mov  ecx, esi
0x14000D0FE:  xor  ecx, 0x13371337
0x14000D104:  call 0x14000C140               ; hash_a
0x14000D109:  xor  eax, 0x92B8E54F           ; check #5 constant
0x14000D10E:  mov  [rbp-0x31], eax

0x14000D111:  mov  ecx, esi
0x14000D113:  xor  ecx, 0xBEEFCAFE
0x14000D119:  call 0x14000BF00               ; hash_b
0x14000D11E:  xor  eax, 0xEC425552           ; check #4 constant
0x14000D123:  mov  [rbp+0x7F], eax

0x14000D126:  imul ecx, esi, 7
0x14000D129:  call 0x14000BF00               ; hash_b
0x14000D12E:  xor  eax, 0x8E6E1C27           ; check #3 constant
0x14000D133:  mov  [rbp+0x77], eax

0x14000D136:  lea  ecx, [rsi - 0x5A5A5A5B]   ; ecx = esi - 0x5A5A5A5B (mod 2^32)
0x14000D13C:  call 0x14000C140               ; hash_a
0x14000D141:  xor  eax, 0x29118CAB           ; check #2 constant
0x14000D146:  mov  [rbp+0x6F], eax

0x14000D149:  mov  ecx, esi
0x14000D14B:  call 0x14000BF00               ; hash_b
0x14000D150:  mov  ecx, eax
0x14000D152:  call 0x14000BF00               ; hash_b (again)
0x14000D157:  xor  eax, 0x7371AA63           ; check #1 constant
0x14000D15C:  mov  [rbp+0x67], eax</code></pre>

            <h3>10.3 Constant-Time OR Zero-Check</h3>
            <p>The five check results (plus one 16-bit value from a <code>.data</code> global) are OR'd together, then collapsed to a single bit via <code>(x | -x) &gt;&gt; 31</code>:</p>
            <pre><code class="language-x86asm">0x14000D15F:  mov  ecx, [rbp+0x67]            ; check #1
0x14000D162:  mov  eax, [rbp+0x6F]            ; check #2
0x14000D165:  or   ecx, eax
0x14000D167:  mov  eax, [rbp+0x77]            ; check #3
0x14000D16A:  or   eax, ecx
0x14000D16C:  mov  ecx, [rbp+0x7F]            ; check #4
0x14000D16F:  or   ecx, eax
0x14000D171:  mov  eax, [rbp-0x31]            ; check #5
0x14000D174:  or   eax, ecx
0x14000D176:  mov  [rbp+0x67], eax
0x14000D179:  movzx ecx, word ptr [rip+0x9BAC]  ; aux word (0 in clean runs)
0x14000D180:  mov  eax, [rbp+0x67]
0x14000D183:  or   eax, ecx
0x14000D185:  mov  [rbp+0x67], eax
0x14000D188:  mov  eax, [rbp+0x67]
0x14000D18B:  neg  eax
0x14000D18D:  mov  ecx, [rbp+0x67]
0x14000D190:  or   ecx, eax                   ; (x | -x)
0x14000D192:  shr  ecx, 0x1F                  ; isolate sign bit
0x14000D195:  mov  [rbp+0x6F], ecx
0x14000D198:  mov  eax, [rbp+0x6F]
0x14000D19B:  test eax, eax
0x14000D19D:  jne  0x14000D1AB                ; &lt;-- DISCRIMINATOR
0x14000D19F:  mov  ecx, esi                   ; pass seed to success path
0x14000D1A1:  call 0x14000BC70                ; success_print(esi)
0x14000D1A6:  jmp  0x14000D3CE                ; skip fail tail</code></pre>
            <div class="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-sm">
                <p class="text-green-400 font-bold mb-1"><i class="ph ph-lightbulb"></i> Structural Insight</p>
                <p class="text-gray-300">This is a textbook <strong>constant-time zero-check</strong>. The five checks are OR'd so no single check can be isolated by timing, and <code>(x | -x) &gt;&gt; 31</code> compresses any non-zero bit pattern to exactly 1. The <code>test eax, eax</code> / <code>jne</code> at the bottom wants eax == 0 to fall through to the success call. Which means <strong>every one of the five XOR results must be exactly zero</strong>.</p>
            </div>

            <h2>11. hash_a and hash_b &mdash; Splitmix32 Pipelines</h2>

            <h3>11.1 hash_b @ 0x14000BF00</h3>
            <p>The function is 560 bytes long, most of it anti-tamper and RDTSC decoy work that writes to global state without ever being read back. The actual hash pipeline is the tail from <code>0x14000C101</code> onward, which uses the saved-<code>ebx</code> original argument and nothing else:</p>
            <pre><code class="language-x86asm">0x14000C101:  xor   ebx, 0x5A17C3E9
0x14000C10D:  imul  eax, ebx, 0x045D9F3B      ; y = x * M1
0x14000C113:  mov   ecx, eax
0x14000C115:  shr   ecx, 0x0F
0x14000C118:  xor   ecx, eax                  ; y ^= y &gt;&gt; 15
0x14000C11A:  imul  edx, ecx, 0x846CA68B      ; z = y * M2
0x14000C120:  mov   eax, edx
0x14000C122:  shr   eax, 0x10
0x14000C125:  xor   eax, edx                  ; z ^= z &gt;&gt; 16
0x14000C127:  xor   eax, 0xB7E15162           ; final xor
0x14000C12C:  add   rsp, 0x20
0x14000C130:  pop   rbx
0x14000C131:  ret</code></pre>

            <h3>11.2 hash_a @ 0x14000C140</h3>
            <p>Structurally identical &mdash; same splitmix32 skeleton, different constants, no final XOR:</p>
            <pre><code class="language-x86asm">0x14000C340:  xor   ebx, 0x7A3B9E1D
0x14000C346:  imul  eax, ebx, 0x31415927      ; y = x * M1
0x14000C34C:  mov   ecx, eax
0x14000C34E:  shr   ecx, 0x0D
0x14000C351:  xor   ecx, eax                  ; y ^= y &gt;&gt; 13
0x14000C353:  imul  edx, ecx, 0x27D4EB2F      ; z = y * M2
0x14000C359:  mov   eax, edx
0x14000C35B:  shr   eax, 0x0F
0x14000C35E:  xor   eax, edx                  ; z ^= z &gt;&gt; 15
0x14000C360:  add   rsp, 0x20
0x14000C364:  pop   rbx
0x14000C365:  ret</code></pre>

            <h3>11.3 Purity Verification</h3>
            <p>Both functions have a tangle of anti-tamper noise in the middle &mdash; reads and writes to <code>.data</code> globals, an RDTSC canary block, a counter increment that triggers a dead-path of honeypot calls if it exceeds 5. I audited every instruction between the prologue <code>mov ebx, ecx</code> and the tail. <code>ebx</code> is <strong>never clobbered on the normal return path</strong>. <code>rbx</code> is non-volatile in the x64 Microsoft ABI, and the bad path containing an <code>xchg ebx, eax</code> is gated by a counter check that is always false under clean execution.</p>
            <p>Net effect: the return value is a pure function of the input <code>ecx</code>, the global state is irrelevant to the hash, and both routines are two-round splitmix32 variants.</p>

            <pre><code class="language-python"># Python reproduction
def hash_a(x):
    x = (x ^ 0x7A3B9E1D) &amp; 0xFFFFFFFF
    y = (x * 0x31415927) &amp; 0xFFFFFFFF
    y = (y ^ (y &gt;&gt; 13)) &amp; 0xFFFFFFFF
    z = (y * 0x27D4EB2F) &amp; 0xFFFFFFFF
    z = (z ^ (z &gt;&gt; 15)) &amp; 0xFFFFFFFF
    return z

def hash_b(x):
    x = (x ^ 0x5A17C3E9) &amp; 0xFFFFFFFF
    y = (x * 0x045D9F3B) &amp; 0xFFFFFFFF
    y = (y ^ (y &gt;&gt; 15)) &amp; 0xFFFFFFFF
    z = (y * 0x846CA68B) &amp; 0xFFFFFFFF
    z = (z ^ (z &gt;&gt; 16)) &amp; 0xFFFFFFFF
    return (z ^ 0xB7E15162) &amp; 0xFFFFFFFF</code></pre>

            <h2>12. Algebraic Inversion &mdash; Recovering the Magic Seed</h2>
            <p>Splitmix32 is trivially invertible. Each stage has a well-known inverse:</p>
            <ul>
                <li><strong>XOR constant</strong> &rarr; XOR constant (self-inverse)</li>
                <li><strong>Multiply odd M</strong> &rarr; multiply by <code>M<sup>-1</sup> (mod 2<sup>32</sup>)</code>, computed via the Newton 2-adic iteration</li>
                <li><strong><code>x ^= x &gt;&gt; n</code></strong> &rarr; iterative top-down bit reconstruction in 32 steps</li>
            </ul>
            <p>With both inverses in hand, the five discriminator equations become five independent statements about <code>esi</code>:</p>

            <pre><code class="language-text">eq1:  hash_a(esi ^ 0x13371337)  = 0x92B8E54F
eq2:  hash_b(esi ^ 0xBEEFCAFE)  = 0xEC425552
eq3:  hash_b(esi * 7)           = 0x8E6E1C27
eq4:  hash_a(esi - 0x5A5A5A5B)  = 0x29118CAB
eq5:  hash_b(hash_b(esi))       = 0x7371AA63</code></pre>

            <p>Each equation is individually solvable:</p>
            <pre><code class="language-python">INV_7     = pow(7, -1, 1 &lt;&lt; 32)
esi_eq1 = 0x13371337 ^ inv_hash_a(0x92B8E54F)
esi_eq2 = 0xBEEFCAFE ^ inv_hash_b(0xEC425552)
esi_eq3 = (inv_hash_b(0x8E6E1C27) * INV_7) &amp; 0xFFFFFFFF
esi_eq4 = (inv_hash_a(0x29118CAB) + 0x5A5A5A5B) &amp; 0xFFFFFFFF
esi_eq5 = inv_hash_b(inv_hash_b(0x7371AA63))</code></pre>

            <p>Running all five:</p>
            <pre><code class="language-text">eq1 -&gt; 0x26EC70E1
eq2 -&gt; 0x26EC70E1
eq3 -&gt; 0x26EC70E1
eq4 -&gt; 0x26EC70E1
eq5 -&gt; 0x26EC70E1

all-consistent: True
forward check1: hash_a(0x26EC70E1 ^ 0x13371337)  = 0x92B8E54F  &#10003;
forward check2: hash_b(0x26EC70E1 ^ 0xBEEFCAFE)  = 0xEC425552  &#10003;
forward check3: hash_b(0x26EC70E1 * 7)           = 0x8E6E1C27  &#10003;
forward check4: hash_a(0x26EC70E1 - 0x5A5A5A5B)  = 0x29118CAB  &#10003;
forward check5: hash_b(hash_b(0x26EC70E1))       = 0x7371AA63  &#10003;</code></pre>

            <div class="flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-white/5 rounded-xl border border-white/5 my-6 w-full overflow-x-auto">
                <div class="text-sm sm:text-lg md:text-2xl lg:text-3xl font-mono font-bold text-green-400 tracking-tight sm:tracking-wide md:tracking-widest text-center mb-2 break-all whitespace-normal">MAGIC_ESI = 0x26EC70E1</div>
                <p class="text-xs text-text-muted mt-2">32-bit seed derived from five over-constrained splitmix32 equations</p>
            </div>

            <p>Five equations, one value. That's over-determined &mdash; even if any one equation were wrong (e.g. I'd misread a constant), the remaining four would disagree on <code>esi</code> and the answer would collapse. The unanimous convergence is independent confirmation that both hash functions are pure splitmix32 and that the discriminator math is exactly as recovered.</p>

            <h2>13. Patch Strategy</h2>

            <h3>13.1 Why File-Level Patching Is Impossible</h3>
            <p>Every section containing original program code has <code>SizeOfRawData = 0</code>. There is no byte at file offset that corresponds to <code>0x14000D19B</code>; the instruction stream exists only in memory after VMP's unpacker runs. Patching the file would require reverse-engineering VMP's compression/encryption and rewriting the packed blob &mdash; massive engineering for a CrackMe.</p>

            <h3>13.2 Runtime Patcher Design</h3>
            <p>The same passive launcher used for the snapshot is upgraded to a patcher. After the prompt appears (guaranteeing unpack), open the process, bump the target page to RWX via <code>VirtualProtectEx</code>, write the new bytes with <code>WriteProcessMemory</code>, restore the page to RX.</p>
            <pre><code class="language-python">h = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ
              | PROCESS_VM_WRITE | PROCESS_QUERY_INFORMATION,
              False, pid)
for va, new_bytes in PATCHES:
    page = va &amp; ~0xFFF
    old  = VirtualProtectEx(h, page, 0x1000, PAGE_EXECUTE_READWRITE)
    WriteProcessMemory(h, va, new_bytes)
    VirtualProtectEx(h, page, 0x1000, old)
CloseHandle(h)</code></pre>

            <h3>13.3 Patch Surface (16 bytes total)</h3>
            <p>Two effects need to combine. First, force <code>esi</code> to the recovered magic seed so all five hash checks land on zero and the success printer receives the correct decryption key. Second, collapse the final <code>test</code> so any residual AT state (the decoy word at <code>0x140016D2C</code> that gets written late in the chain) cannot veto the success branch.</p>

            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">VA</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Orig</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">New</th>
                            <th class="py-2 font-mono uppercase text-xs">Effect</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000D0A4</code></td><td class="py-1 font-mono">8B 35 7E 9C 00 00</td><td class="py-1 font-mono">BE E1 70 EC 26 90</td><td class="py-1"><code>mov esi, [rip+0x9C7E]</code> &rarr; <code>mov esi, 0x26EC70E1; nop</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000D0AA</code></td><td class="py-1 font-mono">33 F0</td><td class="py-1 font-mono">90 90</td><td class="py-1"><code>xor esi, eax</code> &rarr; <code>nop nop</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000D0AC</code></td><td class="py-1 font-mono">E8 BF F2 FF FF</td><td class="py-1 font-mono">90 90 90 90 90</td><td class="py-1"><code>call 0x14000C370</code> &rarr; <code>5&times; nop</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000D0B1</code></td><td class="py-1 font-mono">33 F0</td><td class="py-1 font-mono">90 90</td><td class="py-1"><code>xor esi, eax</code> &rarr; <code>nop nop</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono"><code>0x14000D19B</code></td><td class="py-1 font-mono">85</td><td class="py-1 font-mono">31</td><td class="py-1"><code>test eax, eax</code> &rarr; <code>xor eax, eax</code></td></tr>
                    </tbody>
                </table>
            </div>
            <p>The VM verifier at <code>0x14000D09F</code> is <strong>intentionally left intact</strong>. It sets up internal state that the downstream hash functions touch through those RDTSC/canary globals. Skipping it produces subtle secondary failures. Let it run, then overwrite its output downstream. Fifteen bytes of MOV+NOPs around the seed and one byte flip at the final <code>test</code>.</p>

            <h2>14. Anti-Tamper Behaviour Under Three Patch Modes</h2>
            <p>I tested three patch variants to map the anti-tamper topology:</p>

            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Mode</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Patch</th>
                            <th class="py-2 font-mono uppercase text-xs">Output</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1"><strong>none</strong></td><td class="py-1">&mdash;</td><td class="py-1 text-red-400 font-mono">[-] Yanlis key. Tekrar dene.</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1"><strong>test2xor</strong></td><td class="py-1">1 byte @ 0xD19B</td><td class="py-1 text-yellow-400 font-mono">[garbage] Proof: 2B87-E007-1DB7-E023</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1"><strong>magic</strong></td><td class="py-1">15 bytes @ 0xD0A4</td><td class="py-1 text-red-400 font-mono">[-] Yanlis key. Tekrar dene.</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1"><strong>full</strong></td><td class="py-1">16 bytes (combo)</td><td class="py-1 text-green-400 font-mono">[+] GG, crackme tamam. / Proof: 0754-FB8C-E03C-2B1F</td></tr>
                    </tbody>
                </table>
            </div>

            <p>The test matrix is informative:</p>
            <ul>
                <li><strong>test2xor alone</strong> takes the success branch but leaves <code>esi</code> at the wrong-key value. The success printer runs, but the banner text decodes to garbage bytes (it's a splitmix keystream of a wrong seed) and the Proof value is the mathematical image of the wrong seed through HWID mixing. The real success path is <em>reached</em> but not <em>proven</em>.</li>
                <li><strong>magic alone</strong> produces the correct zero at every one of the five hash checks &mdash; I verified this by reading <code>eax</code> right before the <code>test</code> with a temporary breakpoint. But the final verdict still says fail. The culprit is the 16-bit word at <code>0x140016D2C</code>: late in the chain it gets flipped to non-zero by a block I hadn't fully traced. That word is the one real anti-tamper canary among the dozens of decoys.</li>
                <li><strong>full</strong> combines both: the magic seed zeroes the five hash checks, and the <code>test eax,eax</code> &rarr; <code>xor eax,eax</code> forces the zero flag regardless of the canary word. Belt-and-suspenders. Clean success.</li>
            </ul>

            <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm">
                <p class="text-yellow-400 font-bold mb-1"><i class="ph ph-warning"></i> Anti-Tamper Topology</p>
                <p class="text-gray-300">Out of roughly 30 RDTSC-based canary writes scattered across the hash and verifier functions, <strong>exactly one</strong> is load-bearing in the success check. The rest are pure decoy, designed to make an analyst who tries to neutralize "the" anti-tamper state chase thirty ghosts. Finding the real one requires tracing every <code>.data</code> read inside the discriminator chain and eliminating the writes whose targets never get read back. I did that trace by indexing all <code>mov [rip+disp], imm</code> writes against all <code>mov eax, [rip+disp]</code> reads inside the discriminator range. Only <code>0x140016D2C</code> survived both filters.</p>
            </div>

            <h2>15. Final Output</h2>
            <p>Running the full patcher against the live process:</p>

            <pre><code class="language-text">[crack] spawning: C:\\Users\\Administrator\\Desktop\\ana-test\\crackme.exe
[crack] pid = 51608

  ====================================
        ANAPAZAR Crackme
  ====================================

  Machine ID: 0xDC4B

  Keyi girin

[crack] applying patches:
  [patch] 0x14000D0A4  8b357e9c0000  ->  bee170ec2690
  [patch] 0x14000D0AA  33f0          ->  9090
  [patch] 0x14000D0AC  e8bff2ffff    ->  9090909090
  [patch] 0x14000D0B1  33f0          ->  9090
  [patch] 0x14000D19B  85            ->  31
[crack] magic esi = 0x26EC70E1 injected

  Keyi girin &gt;
  [+] GG, crackme tamam.
  Proof: 0754-FB8C-E03C-2B1F</code></pre>

            <div class="flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-white/5 rounded-xl border border-white/5 my-6 w-full overflow-x-auto">
                <div class="text-sm sm:text-lg md:text-2xl font-mono font-bold text-green-400 tracking-tight sm:tracking-wide md:tracking-widest text-center mb-2 break-all whitespace-normal">[+] GG, crackme tamam.</div>
                <div class="text-sm sm:text-lg md:text-xl font-mono font-bold text-green-400 tracking-tight sm:tracking-wide md:tracking-widest text-center break-all whitespace-normal">Proof: 0754-FB8C-E03C-2B1F</div>
                <p class="text-xs text-text-muted mt-2">Real author-intended banner + HWID-bound proof for Machine ID 0xDC4B</p>
            </div>

            <p>The Proof value is HWID-bound: it is computed as a splitmix32 mangle of <code>MAGIC_ESI ^ HWID</code>, then unpacked into four 16-bit fields. Another machine with a different Machine ID would produce a different (but equally valid) Proof string. The Proof is the author's signature that the real path executed.</p>

            <h2>16. Anti-Analysis Techniques Summary</h2>

            <h3>16.1 VMProtect 3.x Outer Shell</h3>
            <p>All original code stripped to memory-only. Sole on-disk content is the 27 MB <code>.Sd~</code> encrypted stream. Defeats static unpacking without a dedicated VMP devirtualizer.</p>

            <h3>16.2 Custom 28-Opcode VM for ECDSA</h3>
            <p>ECDSA-P256 verification is implemented as bytecode executed by a custom interpreter at <code>0x140009080</code>. The <code>BCryptVerifySignature</code> import exists only to decorate the IAT &mdash; it is never called. An analyst who patches or hooks the CNG API sees zero behavioural change.</p>

            <h3>16.3 Nine String Honeypots</h3>
            <p>Plaintext decoys across the <code>.rdata</code> pool: SQL, HTTP, Base64 RSA keys, registry persistence paths, fake success banners. All have zero cross-references.</p>

            <h3>16.4 Encrypted Feedback Strings</h3>
            <p>Both the "Yanlis key" failure message and the "[+] GG, crackme tamam." success banner are XOR-masked with a splitmix32 keystream derived from the <code>esi</code> seed. Neither appears as plaintext in memory at any time.</p>

            <h3>16.5 Dynamic API Resolution</h3>
            <p>Sixteen anti-debug APIs (<code>IsDebuggerPresent</code>, <code>CheckRemoteDebuggerPresent</code>, <code>NtQueryInformationProcess</code>, <code>NtSetInformationThread</code>, <code>NtQuerySystemInformation</code>, <code>GetThreadContext</code>, etc.) are resolved at runtime via a manual <code>LoadLibrary</code> / <code>GetProcAddress</code> replacement (<code>0x1400055B0</code>). None appear in the import table.</p>

            <h3>16.6 Module-Name Fingerprinting</h3>
            <p>DJB2 variant over loaded module names, checked against a table of known-debugger hashes at <code>0x14000FCE0</code>. Runs during init; kills the process silently on match.</p>

            <h3>16.7 RDTSC Timing Canaries (mostly decoys)</h3>
            <p>Dozens of <code>RDTSC</code>-based canary writes to <code>.data</code> globals. Out of roughly thirty, exactly one (<code>0x140016D2C</code>) feeds the discriminator. The rest exist solely to confuse an analyst.</p>

            <h3>16.8 Constant-Time Zero-Check Discriminator</h3>
            <p>Five hash results OR'd together with an AT word and collapsed to a single bit via <code>(x | -x) &gt;&gt; 31</code>. Prevents timing-based leakage of <em>which</em> check failed.</p>

            <h3>16.9 Honeypot Success Format</h3>
            <p>A fake success string <code>"License check passed, unlocking premium features..."</code> sits adjacent to the real format in memory. The decoy has zero xrefs; the real one ("Proof: %04X-%04X-%04X-%04X") is buried 216 bytes later in the same pool.</p>

            <h3>16.10 SMC on Data (not Code)</h3>
            <p>The middle of each hash function XOR-mangles a 16-byte data buffer (<code>0x140016360</code>) in place on every call. The mangled buffer is then written to decoy globals but never fed into the actual hash pipeline. A <em>superficial</em> analysis of either hash function spots the SMC-style rewrite and assumes state-dependence; a full trace confirms the output tail reads only <code>ebx</code> (saved input).</p>

            <h3>16.11 TLS Callback</h3>
            <p>TLS directory declares callbacks via an <code>AddressOfCallBacks</code> pointer that is <code>NULL</code> in the on-disk PE. VMP patches the pointer during unpack and runs the callback before <code>main()</code>. Under a debugger this fires before you can set breakpoints.</p>

            <h2>17. Proof Chain</h2>
            <ol>
                <li><strong>Protector identification</strong>: Six independent structural signals (EP in <code>.Sd~</code>, <code>RawSize=0</code> standard sections, uniform 7.99 entropy, IAT rebuild, TLS with null callback ptr, oversized exception dir) collectively prove VMProtect 3.x.</li>
                <li><strong>Honeypot verdict</strong>: A Capstone sweep for <code>LEA [RIP+disp]</code> operands matching each decoy string's VA returned zero matches across all RX regions. None of the nine honeypot strings is loaded by any instruction.</li>
                <li><strong>BCrypt bait</strong>: The same sweep over the resolved runtime address of <code>BCryptVerifySignature</code> also returned zero. The CNG import is decorative.</li>
                <li><strong>Discriminator localisation</strong>: The success printer at <code>0x14000BC70</code> has exactly one caller (<code>0x14000D1A1</code>), reached through the <code>test</code> / <code>jne</code> pair at <code>0x14000D19B-0x14000D19D</code>.</li>
                <li><strong>Hash purity</strong>: Instruction-level audit of <code>hash_a</code> and <code>hash_b</code> confirms <code>ebx</code> is never modified on the normal return path, that only the bad path (<code>counter &gt; 5</code>) contains an <code>xchg ebx, eax</code>, and that the tail pipeline depends solely on <code>ebx</code>.</li>
                <li><strong>Splitmix32 constants</strong>: M1 and M2 for both hashes are odd, hence invertible mod <code>2<sup>32</sup></code>. Modular inverses computed via Newton 2-adic iteration; self-test passes roundtrip on 10 sample values for both functions.</li>
                <li><strong>Equation convergence</strong>: Five independently derived values for <code>esi</code> all equal <code>0x26EC70E1</code>. Forward verification: all five hash checks produce exactly their target constants when <code>esi</code> is set to the recovered value.</li>
                <li><strong>Patch behaviour</strong>: Three patch modes (test2xor, magic, full) produce exactly the behaviour predicted by the discriminator model. The "magic" mode proves the five-check math is correct; the "test2xor" mode proves the binary does reach the success printer from the predicted branch; the "full" mode proves both corrections are necessary and together sufficient.</li>
                <li><strong>Final output</strong>: <code>[+] GG, crackme tamam.</code> + <code>Proof: 0754-FB8C-E03C-2B1F</code> &mdash; the real author-intended banner and HWID-bound proof emerge on a run with the 16-byte patch applied. No stdout injection, no filtering &mdash; the binary prints this of its own accord.</li>
            </ol>

            <h2>18. Key Functions Reference</h2>
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
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x1400055B0</td><td class="py-2">dyn_resolve</td><td class="py-2">LoadLibrary + GetProcAddress for anti-debug APIs</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x140005A50</td><td class="py-2">mod_hash_check</td><td class="py-2">DJB2 module-name hash table lookup</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x1400059B0</td><td class="py-2">resolve_antidebug</td><td class="py-2">Populates anti-debug API dispatch table</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x1400061D0</td><td class="py-2">get_hwid</td><td class="py-2">Returns Machine ID (low 16 bits, 0xDC4B on this host)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x140009080</td><td class="py-2">vm_verifier</td><td class="py-2">Custom 28-opcode VM, manual ECDSA-P256 verify</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000AC03</td><td class="py-2">key_parser</td><td class="py-2">XXXX-XXXX-XXXX-XXXX format parser</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000B053</td><td class="py-2">fail_path</td><td class="py-2">Prints XOR-decoded "Yanlis key" message</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000BC70</td><td class="py-2">success_print</td><td class="py-2">XOR-decodes banner + prints Proof format</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000BF00</td><td class="py-2">hash_b</td><td class="py-2">Splitmix32 (M1=0x045D9F3B, M2=0x846CA68B, +final XOR)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000C140</td><td class="py-2">hash_a</td><td class="py-2">Splitmix32 (M1=0x31415927, M2=0x27D4EB2F, no final XOR)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000C370</td><td class="py-2">g_update</td><td class="py-2">Anti-debug-aware seed contributor</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000D082</td><td class="py-2">main_check</td><td class="py-2">Discriminator function (seed build + 5 hash checks + OR zero-test)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14000D19B</td><td class="py-2">discriminator</td><td class="py-2"><code>test eax, eax; jne fail</code> &mdash; single patch target</td></tr>
                    </tbody>
                </table>
            </div>

            <h2>19. Closing Note</h2>
            <p>ANAPAZAR is a well-engineered honeypot maze on top of an otherwise tractable core. The outer shell is industrial-grade (VMProtect 3.x), the middle layer is a decorative import plus a 28-opcode VM implementing ECDSA by hand, and the inner core is five equations over two splitmix32 hashes &mdash; invertible with fifty lines of Python.</p>
            <p>The author put real effort into misdirection. Nine plaintext honeypot strings, sixteen dynamically-resolved anti-debug APIs, thirty RDTSC canaries where only one matters, a fake CNG import as a billboard, and an encrypted success banner so an analyst who only patches the <code>jne</code> sees garbage text and assumes they broke the wrong thing. The misdirection costs the analyst time; it doesn't cost the crack correctness.</p>
            <p>The crack in the end is almost anticlimactic. Five equations, one seed, sixteen patched bytes, and the binary prints what it was designed to print. VMProtect never knew it had been touched.</p>

            <div class="mt-12 text-center">
                <p class="text-xl text-white font-bold mb-2">Magic Seed: <code class="text-green-400">0x26EC70E1</code></p>
                <p class="text-xl text-white font-bold mb-2">Banner: <code class="text-green-400">[+] GG, crackme tamam.</code></p>
                <p class="text-xl text-white font-bold mb-2">Proof (0xDC4B): <code class="text-green-400">0754-FB8C-E03C-2B1F</code></p>
                <p class="text-text-muted italic">dr4gan &mdash; April 2026</p>
            </div>
        </div>
    `
});
