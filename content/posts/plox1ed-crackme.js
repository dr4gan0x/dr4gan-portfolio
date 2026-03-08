/**
 * Post: plox1ed CrackMe-CG — Full Reverse Engineering Write-Up
 * Category: Reverse Engineering
 */

window.Dr4ganData.posts.push({
    id: "plox1ed-crackme",
    title: "plox1ed CrackMe-CG — Full Reverse Engineering Write-Up",
    date: "03/08/2026",
    category: "Reverse Engineering",
    tags: ["CrackMe", "PE64", "Windows", "Themida", "x64dbg", "Patching", "Anti-Debug", "MinGW"],
    description: "Dynamic analysis of a Themida-packed CrackMe: PE structure archaeology, runtime string decryption, hardcoded password extraction from QWORD immediates, weighted scoring algorithm, and a 3-byte runtime patcher bypassing the length gate — all through x64dbg.",
    image: null,
    content: `
        <div class="space-y-8">
            <!-- Metadata Block -->
            <div class="bg-white/[0.03] p-4 md:p-6 rounded-xl border border-white/5 font-mono text-xs sm:text-sm space-y-3">
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Target</span>
                    <span class="text-white break-words">plox1ed CrackMe-CG (crackme-cg.exe)</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Platform</span>
                    <span class="text-white break-words">PE64 / x86-64 / Windows 10</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Size</span>
                    <span class="text-white break-words">~21 KB on disk / ~9.5 MB in memory</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Protection</span>
                    <span class="text-white break-words">Themida (13 sections, encrypted)</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Tooling</span>
                    <span class="text-white break-words">x64dbg, Python 3</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 pt-1">
                    <span class="text-text-muted">Result</span>
                    <span class="text-green-400 font-bold tracking-wider break-words">PASSWORD + RUNTIME_PATCH</span>
                </div>
            </div>

            <h2>1. Initial Reconnaissance</h2>
            <p>The target binary is a console-mode Windows executable distributed as a single PE file. On first execution it presents a simple challenge prompt, accepts user input, and renders a pass/fail verdict:</p>
            <pre><code class="language-text">[>] Sifreyi gir: testkey123
[-] Basaramadin, tekrar dene.</code></pre>
            <p>The program does not terminate immediately after the failure message &mdash; it waits for a keypress before exiting. This hints at a <code>_getch()</code> call in the epilogue.</p>
            <p>The file weighs in at roughly 21 KB on disk, yet the PE header declares an image size of <code>0x94B000</code> (~9.5 MB) across 13 sections. That discrepancy is the first red flag.</p>

            <h2>2. PE Structure Analysis</h2>
            <p>Loading the binary into x64dbg and reading the PE header directly from the image base at <code>0x7FF772770000</code> reveals the full picture.</p>

            <h3>2.1 File Header</h3>
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
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">NumberOfSections</td><td class="py-2">13</td><td class="py-2">Abnormally high for a simple CrackMe</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">SizeOfOptionalHeader</td><td class="py-2"><code>0xF0</code> (240)</td><td class="py-2">Standard PE32+</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">Characteristics</td><td class="py-2"><code>0x022E</code></td><td class="py-2">EXECUTABLE_IMAGE, LARGE_ADDRESS_AWARE, DEBUG_STRIPPED</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">Magic</td><td class="py-2"><code>0x020B</code></td><td class="py-2">PE32+ (64-bit)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">LinkerVersion</td><td class="py-2">2.44</td><td class="py-2">GCC/MinGW linker signature</td></tr>
                    </tbody>
                </table>
            </div>
            <p>The linker version <code>2.44</code> immediately identifies the toolchain: this is a <strong>MinGW/GCC</strong> compiled binary. Further confirmed by strings in <code>.rdata</code> (<code>libgcc_s_dw2-1.dll</code>, <code>__register_frame_info</code>) and statically-linked C++ runtime.</p>

            <h3>2.2 Section Table</h3>
            <p>Every section header was parsed byte-by-byte from the raw PE header at image base + <code>0x188</code>:</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">#</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Name</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">VAddr</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">RawSize</th>
                            <th class="py-2 font-mono uppercase text-xs">Note</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1">0</td><td class="py-1 font-mono">.text</td><td class="py-1"><code>0x1000</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">Code &mdash; empty on disk</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">1</td><td class="py-1 font-mono">.data</td><td class="py-1"><code>0xC9000</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">Data &mdash; empty on disk</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">2</td><td class="py-1 font-mono">.rdata</td><td class="py-1"><code>0xCD000</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">Read-only data &mdash; empty</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">3</td><td class="py-1 font-mono">.eh_fram</td><td class="py-1"><code>0xE0000</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">GCC exception frame</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">4</td><td class="py-1 font-mono">.pdata</td><td class="py-1"><code>0xE1000</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">Exception directory</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">5</td><td class="py-1 font-mono">.xdata</td><td class="py-1"><code>0xEE000</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">Unwind info</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">6</td><td class="py-1 font-mono">.bss</td><td class="py-1"><code>0xFF000</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">Uninitialized data</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">7</td><td class="py-1 font-mono">.idata</td><td class="py-1"><code>0x100000</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">Import directory &mdash; empty</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">8</td><td class="py-1 font-mono">.tls</td><td class="py-1"><code>0x102000</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">Thread-local storage</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">9</td><td class="py-1 font-mono">.themida</td><td class="py-1"><code>0x103000</code></td><td class="py-1 text-red-400 font-bold">0</td><td class="py-1">Themida code #1</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">10</td><td class="py-1 font-mono">.themida</td><td class="py-1"><code>0x417000</code></td><td class="py-1">2</td><td class="py-1">Themida data (IAT)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">11</td><td class="py-1 font-mono">.themida</td><td class="py-1"><code>0x418000</code></td><td class="py-1 text-green-400 font-bold">0x5318</td><td class="py-1">Themida loader &mdash; only real data on disk</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">12</td><td class="py-1 font-mono">.reloc</td><td class="py-1"><code>0x94A000</code></td><td class="py-1">2</td><td class="py-1">Relocations</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm">
                <p class="text-red-400 font-bold mb-1"><i class="ph ph-shield-warning"></i> Critical Observation</p>
                <p class="text-gray-300"><strong>Every standard section has <code>SizeOfRawData = 0</code></strong>. The only section with meaningful on-disk data is <code>.themida</code> #11 holding <code>0x5318</code> bytes (21,272 bytes). This is the Themida unpacking stub &mdash; the entire original program is packed/encrypted within these ~21 KB and reconstructed in memory at runtime.</p>
            </div>

            <h3>2.3 Section Name Trust &mdash; Cross-Check</h3>
            <p>Per standard practice, section names alone prove nothing. A section named <code>.themida</code> does not guarantee Themida protection &mdash; it could be a deliberate mislabel. The actual evidence:</p>
            <ol>
                <li><strong>Entry point inside the protection section</strong> &mdash; not in <code>.text</code></li>
                <li><strong>All standard sections empty on disk</strong> &mdash; classic packer behavior</li>
                <li><strong>File size (~21 KB) vs image size (~9.5 MB)</strong> &mdash; 450:1 expansion ratio</li>
                <li><strong>Only 5 loaded DLLs</strong> &mdash; minimal dependency footprint</li>
                <li><strong>14 imports total</strong> &mdash; statically linked CRT, only essential externals</li>
            </ol>
            <p>These five independent signals collectively confirm a legitimate Themida protection layer.</p>

            <h2>3. Runtime Environment</h2>

            <h3>3.1 Module Map</h3>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Module</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Base</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Size</th>
                            <th class="py-2 font-mono uppercase text-xs">Entry</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">crackme-cg.exe</td><td class="py-1"><code>0x7FF772770000</code></td><td class="py-1"><code>0x94B000</code></td><td class="py-1"><code>0x7FF772E292F6</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">ucrtbase.dll</td><td class="py-1"><code>0x7FFEA89C0000</code></td><td class="py-1"><code>0x100000</code></td><td class="py-1"><code>0x7FFEA89D6110</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">kernelbase.dll</td><td class="py-1"><code>0x7FFEA8B70000</code></td><td class="py-1"><code>0x2C9000</code></td><td class="py-1"><code>0x7FFEA8B80710</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">kernel32.dll</td><td class="py-1"><code>0x7FFEA9420000</code></td><td class="py-1"><code>0xBE000</code></td><td class="py-1"><code>0x7FFEA94370D0</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">ntdll.dll</td><td class="py-1"><code>0x7FFEAAE50000</code></td><td class="py-1"><code>0x1F5000</code></td><td class="py-1"><code>0x0</code></td></tr>
                    </tbody>
                </table>
            </div>

            <h3>3.2 Import Table (Resolved at Runtime)</h3>
            <p>Themida redirects the IAT into its own RW section (<code>.themida</code> #10 at <code>0x7FF772B87000</code>). Reading the resolved pointers:</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">IAT Slot</th>
                            <th class="py-2 font-mono uppercase text-xs">API</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">+0x00</td><td class="py-1"><code>CheckRemoteDebuggerPresent</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">+0x10</td><td class="py-1"><code>_getch</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">+0x20</td><td class="py-1"><code>mbrtowc</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">+0x30</td><td class="py-1"><code>__p__environ</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">+0x50</td><td class="py-1"><code>_set_new_mode</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">+0x80</td><td class="py-1"><code>__C_specific_handler</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">+0xB0</td><td class="py-1"><code>_strdup</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">+0xD0</td><td class="py-1"><code>rand_s</code></td></tr>
                    </tbody>
                </table>
            </div>
            <p>Notable: <strong><code>CheckRemoteDebuggerPresent</code></strong> (anti-debug), <strong><code>rand_s</code></strong> (cryptographic random), <strong><code>_strdup</code></strong> (string duplication). No <code>printf</code>, <code>scanf</code>, <code>strcmp</code>, or <code>strlen</code> in imports &mdash; all statically linked into the ~800 KB <code>.text</code> section.</p>

            <h3>3.3 Memory Anomalies</h3>
            <div class="bg-[#0a0a0a] p-4 rounded-lg border border-white/5 font-mono text-sm space-y-2">
                <p><strong class="text-white">0x320000</strong> (0xA000) &mdash; <span class="text-red-400">ERW (PRV)</span> &mdash; Execute+Read+Write private page: Themida runtime code</p>
                <p><strong class="text-white">0x3F0000&ndash;0xD20000</strong> (~20 pages) &mdash; <span class="text-yellow-400">ER- (PRV)</span> &mdash; Themida-allocated executable pages</p>
            </div>

            <h3>3.4 Handle &amp; Network Profile</h3>
            <ul>
                <li><strong>35 handles</strong> &mdash; standard console I/O, one file handle, registry key for NLS, ETW registrations. No mutex, no named pipes.</li>
                <li><strong>0 TCP connections</strong> &mdash; no network activity.</li>
                <li><strong>2 threads</strong> &mdash; main thread (TID 6640) + worker thread (TID 8692, ntdll worker queue). Clean.</li>
            </ul>

            <h2>4. Locating main()</h2>
            <p>With the process paused at stdin (waiting for password input), the debugger sits in <code>ntdll!NtReadFile</code>. The challenge is tracing back from this syscall through the CRT layers to the actual program logic.</p>

            <h3>4.1 Stack Archaeology</h3>
            <p>Reading the stack from RSP (<code>0x7FF928</code>) upward, scanning for return addresses within the <code>.text</code> range:</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Stack Addr</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Value</th>
                            <th class="py-2 font-mono uppercase text-xs">Location</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">0x7FFB48</td><td class="py-1"><code>0x7FF7727F4861</code></td><td class="py-1">CRT stream internals</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">0x7FFB78</td><td class="py-1"><code>0x7FF772833906</code></td><td class="py-1">CRT I/O</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">0x7FFC40</td><td class="py-1"><code>0x7FF77277CFB0</code></td><td class="py-1">CRT __main area</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">0x7FFD20</td><td class="py-1"><code>0x7FF772771340</code></td><td class="py-1 text-green-400 font-bold">CRT startup &mdash; key frame</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">0x7FFD28</td><td class="py-1"><code>0x7FF772B7CF72</code></td><td class="py-1">.themida &rarr; OEP transition</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">0x7FFD48</td><td class="py-1"><code>0x7FF772E292F6</code></td><td class="py-1">Themida entry point</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">0x7FFE08</td><td class="py-1"><code>0x7FFEA9437034</code></td><td class="py-1">kernel32!BaseThreadInitThunk</td></tr>
                    </tbody>
                </table>
            </div>
            <p>Full call chain: <code>ntdll</code> &rarr; <code>kernel32</code> &rarr; Themida EP &rarr; Themida code &rarr; OEP region &rarr; CRT &rarr; <strong>main</strong> &rarr; CRT I/O &rarr; syscall.</p>

            <h3>4.2 CRT Startup Dissection</h3>
            <p>Disassembling from <code>0x7FF772771300</code>:</p>
            <pre><code class="language-x86asm">0x7FF772771309:  call 0x7FF77277CFB7        ; __main() - C++ global constructors
0x7FF77277130E:  mov  rax, [0x7FF772843720]
0x7FF772771315:  mov  rax, [rax]
0x7FF772771318:  mov  rdx, [0x7FF77286F010] ; envp
0x7FF77277131F:  mov  [rax], rdx
0x7FF772771322:  mov  rcx, [0x7FF77286F010] ; envp -> R8
0x7FF772771329:  mov  rdx, [0x7FF77286F008] ; argv -> RDX
0x7FF772771330:  mov  eax, [0x7FF77286F004] ; argc -> ECX
0x7FF772771336:  mov  r8, rcx
0x7FF772771339:  mov  ecx, eax
0x7FF77277133B:  call 0x7FF7728358E0        ; &lt;-- main(argc, argv, envp)</code></pre>
            <p>Textbook MinGW <code>__tmainCRTStartup</code>: calls <code>__main()</code> for static constructors, loads <code>argc/argv/envp</code> from <code>.bss</code> globals, sets up x64 calling convention, then calls <strong><code>main()</code> at <code>0x7FF7728358E0</code></strong>.</p>

            <h2>5. main() &mdash; Complete Disassembly and Analysis</h2>
            <p>The entire main function spans <code>0x7FF7728358E0</code>&ndash;<code>0x7FF7728359DA</code>.</p>

            <h3>5.1 Prologue and Encrypted Data Load</h3>
            <pre><code class="language-x86asm">0x7FF7728358E0:  push rbp
0x7FF7728358E1:  push rdi
0x7FF7728358E2:  push rsi
0x7FF7728358E3:  push rbx
0x7FF7728358E4:  sub  rsp, 0x68

0x7FF7728358E8:  mov  esi, 0x55                          ; XOR key base = 0x55
0x7FF7728358ED:  call 0x7FF77277CFB7                      ; __main() (idempotent)
0x7FF7728358F2:  movzx eax, word ptr [0x7FF77283D070]     ; load 2 bytes from .rdata
0x7FF7728358F9:  lea  rbp, [rsp+0x20]                     ; buffer base
0x7FF772835900:  movdqa xmm0, [0x7FF77283D060]            ; load 16 bytes from .rdata
0x7FF77283590E:  sub  esi, ebp                            ; esi = 0x55 - low32(rbp)</code></pre>
            <p>The encrypted blob from <code>.rdata</code> at <code>0x7FF77283D060</code> (18 bytes):</p>
            <pre><code class="language-text">0B 10 39 6A 33 D3 C8 FC BD E3 ED 0A D7 A3 B4 C4 F2 0E</code></pre>

            <h3>5.2 Decryption Loop 1 &mdash; Prompt Generation</h3>
            <pre><code class="language-x86asm">0x7FF772835920:  movzx eax, byte ptr [rdx]      ; al = encrypted[i]
0x7FF772835923:  lea   r8d, [rsi+rdx]            ; r8d = esi + &amp;buf[i]
0x7FF772835927:  add   rdx, 1                    ; i++
0x7FF77283592B:  add   eax, 3                    ; al += 3
0x7FF77283592E:  xor   eax, r8d                  ; al ^= (0x55 + i)
0x7FF772835931:  sub   eax, ecx                  ; al -= 7*i
0x7FF772835933:  add   ecx, 7                    ; counter += 7
0x7FF772835936:  mov   byte ptr [rdx-1], al      ; buf[i] = decrypted byte
0x7FF772835939:  cmp   rdx, rdi                  ; end of buffer?
0x7FF77283593C:  jnz   0x7FF772835920            ; loop</code></pre>
            <p>The <code>sub esi, ebp</code> is a position-independence trick. Since <code>rdx</code> starts at <code>rbp</code> and <code>r8d = esi + rdx = (0x55 - ebp_low32) + rdx_low32</code>, when <code>rdx = rbp</code>: <code>r8d = 0x55</code>. The base address cancels out. Per byte:</p>
            <pre><code class="language-c">decrypted[i] = ((encrypted[i] + 3) ^ (0x55 + i)) - (7 * i)</code></pre>

            <h3>5.3 Decryption Verification (All 18 Bytes)</h3>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">i</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">enc</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">+3</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">^(0x55+i)</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">-(7&times;i)</th>
                            <th class="py-2 font-mono uppercase text-xs">char</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 font-mono text-xs">
                        <tr class="border-b border-white/5"><td class="py-1">0</td><td class="py-1">0x0B</td><td class="py-1">0x0E</td><td class="py-1">0x5B</td><td class="py-1">0x5B</td><td class="py-1 text-green-400">[</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">1</td><td class="py-1">0x10</td><td class="py-1">0x13</td><td class="py-1">0x45</td><td class="py-1">0x3E</td><td class="py-1 text-green-400">&gt;</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">2</td><td class="py-1">0x39</td><td class="py-1">0x3C</td><td class="py-1">0x6B</td><td class="py-1">0x5D</td><td class="py-1 text-green-400">]</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">3</td><td class="py-1">0x6A</td><td class="py-1">0x6D</td><td class="py-1">0x35</td><td class="py-1">0x20</td><td class="py-1 text-green-400">&nbsp;</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">4</td><td class="py-1">0x33</td><td class="py-1">0x36</td><td class="py-1">0x6F</td><td class="py-1">0x53</td><td class="py-1 text-green-400">S</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">5</td><td class="py-1">0xD3</td><td class="py-1">0xD6</td><td class="py-1">0x8C</td><td class="py-1">0x69</td><td class="py-1 text-green-400">i</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">6</td><td class="py-1">0xC8</td><td class="py-1">0xCB</td><td class="py-1">0x90</td><td class="py-1">0x66</td><td class="py-1 text-green-400">f</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">7</td><td class="py-1">0xFC</td><td class="py-1">0xFF</td><td class="py-1">0xA3</td><td class="py-1">0x72</td><td class="py-1 text-green-400">r</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">8</td><td class="py-1">0xBD</td><td class="py-1">0xC0</td><td class="py-1">0x9D</td><td class="py-1">0x65</td><td class="py-1 text-green-400">e</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">9</td><td class="py-1">0xE3</td><td class="py-1">0xE6</td><td class="py-1">0xB8</td><td class="py-1">0x79</td><td class="py-1 text-green-400">y</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">10</td><td class="py-1">0xED</td><td class="py-1">0xF0</td><td class="py-1">0xAF</td><td class="py-1">0x69</td><td class="py-1 text-green-400">i</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">11</td><td class="py-1">0x0A</td><td class="py-1">0x0D</td><td class="py-1">0x6D</td><td class="py-1">0x20</td><td class="py-1 text-green-400">&nbsp;</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">12</td><td class="py-1">0xD7</td><td class="py-1">0xDA</td><td class="py-1">0xBB</td><td class="py-1">0x67</td><td class="py-1 text-green-400">g</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">13</td><td class="py-1">0xA3</td><td class="py-1">0xA6</td><td class="py-1">0xC4</td><td class="py-1">0x69</td><td class="py-1 text-green-400">i</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">14</td><td class="py-1">0xB4</td><td class="py-1">0xB7</td><td class="py-1">0xD4</td><td class="py-1">0x72</td><td class="py-1 text-green-400">r</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">15</td><td class="py-1">0xC4</td><td class="py-1">0xC7</td><td class="py-1">0xA3</td><td class="py-1">0x3A</td><td class="py-1 text-green-400">:</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">16</td><td class="py-1">0xF2</td><td class="py-1">0xF5</td><td class="py-1">0x90</td><td class="py-1">0x20</td><td class="py-1 text-green-400">&nbsp;</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">17</td><td class="py-1">0x0E</td><td class="py-1">0x11</td><td class="py-1">0x77</td><td class="py-1">0x00</td><td class="py-1 text-green-400">\\0</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-sm">
                <p class="text-green-400 font-bold mb-1"><i class="ph ph-check-circle"></i> Verified Result</p>
                <p class="text-gray-300"><code>[>] Sifreyi gir: \\0</code> &mdash; the prompt string, mathematically verified byte by byte.</p>
            </div>

            <h3>5.4 Re-encryption Loop 2 &mdash; Buffer Sanitization</h3>
            <pre><code class="language-c">// Inverse formula per byte
new[i] = ((decrypted[i] + 7*i) ^ (0x55 + i)) - 3</code></pre>
            <p>This is the exact algebraic inverse of Loop 1. It restores the buffer to its original encrypted state. The purpose is <strong>anti-forensic</strong>: the plaintext prompt string exists in memory only for the brief window between decryption and the <code>fwrite</code> call. After output, it is immediately destroyed.</p>

            <h3>5.5 User Input</h3>
            <pre><code class="language-x86asm">0x7FF77283597C:  lea  rbx, [rsp+0x40]               ; rbx = &amp;std::string
0x7FF772835981:  mov  rcx, [0x7FF7728430E0]          ; cin stream
0x7FF772835988:  lea  rax, [rsp+0x50]                ; SSO buffer
0x7FF77283598D:  mov  qword ptr [rsp+0x48], 0        ; length = 0
0x7FF772835996:  mov  rdx, rbx                       ; &amp;string
0x7FF7728359A3:  call 0x7FF7728338E0                  ; operator>>(cin, string)</code></pre>
            <p>Input is read into a <code>std::string</code> at <code>rsp+0x40</code> with SSO (Small String Optimization) buffer at <code>rsp+0x50</code>.</p>

            <h3>5.6 Length Gate and Password Check Dispatch</h3>
            <pre><code class="language-x86asm">0x7FF7728359A8:  xor  eax, eax                       ; default result = 0 (FAIL)
0x7FF7728359AA:  cmp  qword ptr [rsp+0x48], 0x0B     ; length == 11?
0x7FF7728359B0:  jnz  0x7FF7728359BA                  ; skip check if wrong length
0x7FF7728359B2:  mov  rcx, rbx                        ; rcx = &amp;input_string
0x7FF7728359B5:  call 0x7FF7727716F0                   ; check_password()</code></pre>
            <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm">
                <p class="text-blue-400 font-bold mb-1"><i class="ph ph-key"></i> First Gate</p>
                <p class="text-gray-300">Input length must be exactly <strong>11 characters</strong>. Any other length results in immediate failure without ever reaching the comparison logic.</p>
            </div>

            <h3>5.7 Result Output and Cleanup</h3>
            <pre><code class="language-x86asm">0x7FF7728359BA:  movzx ecx, al                        ; ecx = result (0 or 1)
0x7FF7728359BD:  call  0x7FF7727717E0                  ; print_result(success)
0x7FF7728359C2:  call  0x7FF772A4337E                  ; Themida call (_getch / anti-tamper)
0x7FF7728359C7:  lahf                                  ; capture flags (dead code)
0x7FF7728359CB:  call  0x7FF7728201E0                  ; ~basic_string() destructor
0x7FF7728359D0:  xor   eax, eax                        ; return 0
0x7FF7728359DA:  ret</code></pre>
            <p>The <code>lahf</code> at <code>0x7FF7728359C7</code> captures the flags register into AH after the Themida call, but AH is never read before being clobbered by <code>xor eax, eax</code>. This is either dead code from the compiler or an intentional red herring.</p>

            <h2>6. Password Check Function &mdash; <code>check_password()</code></h2>
            <p>This is where the password lives. Located at <code>0x7FF7727716F0</code>.</p>

            <h3>6.1 Full Disassembly</h3>
            <pre><code class="language-x86asm">0x7FF7727716F0:  sub  rsp, 0x28
0x7FF7727716F4:  xor  edx, edx                         ; score = 0
0x7FF7727716F6:  mov  rax, 0x334B43345243215E           ; QWORD immediate
0x7FF772771700:  mov  r8, qword ptr [rcx]               ; r8 = input data pointer
0x7FF772771703:  mov  qword ptr [rsp+0x15], rax         ; build expected on stack
0x7FF772771708:  lea  rcx, [rsp+0x0A]                   ; rcx = &amp;expected
0x7FF77277170D:  mov  dword ptr [rsp+0x1C], 0x5E214433  ; DWORD immediate (overlap)

; --- Comparison Loop ---
0x7FF772771729:  jmp  0x7FF77277174D
0x7FF77277174D:  movzx r9d, byte ptr [r8+rax]           ; r9 = input[i]
0x7FF772771752:  cmp   byte ptr [rcx+rax], r9b          ; expected[i] == input[i]?
0x7FF772771756:  jnz   0x7FF772771740                   ; mismatch

; Match path:
0x7FF772771758:  add  rax, 1
0x7FF77277175C:  add  edx, 0x0A                         ; score += 10
0x7FF77277175F:  cmp  rax, 0x0B
0x7FF772771763:  jnz  0x7FF77277174D

; Mismatch path:
0x7FF772771740:  add  rax, 1
0x7FF772771744:  sub  edx, 1                            ; score -= 1
0x7FF772771747:  cmp  rax, 0x0B
0x7FF77277174B:  jz   0x7FF772771765

; --- Verdict ---
0x7FF772771765:  test edx, edx
0x7FF772771767:  setnle al                              ; al = (score > 0) ? 1 : 0
0x7FF77277176A:  add  rsp, 0x28
0x7FF77277176E:  ret</code></pre>

            <h3>6.2 Expected Password Construction</h3>
            <p>The function builds the expected password from two immediate values using overlapping writes:</p>
            <p><strong>Step 1</strong> &mdash; QWORD <code>0x334B43345243215E</code> stored at <code>rsp+0x15</code> (little-endian):</p>
            <pre><code class="language-text">rsp+0x15: 5E 21 43 52 34 43 4B 33
           ^  !  C  R  4  C  K  3</code></pre>
            <p><strong>Step 2</strong> &mdash; DWORD <code>0x5E214433</code> stored at <code>rsp+0x1C</code> (little-endian):</p>
            <pre><code class="language-text">rsp+0x1C: 33 44 21 5E
           3  D  !  ^</code></pre>
            <p>Byte at <code>rsp+0x1C</code> was already <code>0x33</code> from the QWORD write &mdash; the overlap is harmless (same value).</p>
            <p><strong>Combined buffer (11 bytes):</strong></p>
            <pre><code class="language-text">5E 21 43 52 34 43 4B 33 44 21 5E
 ^  !  C  R  4  C  K  3  D  !  ^</code></pre>

            <h3>6.3 Password</h3>
            <div class="flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-white/5 rounded-xl border border-white/5 my-6 w-full overflow-x-auto">
                <div class="text-sm sm:text-lg md:text-2xl lg:text-3xl font-mono font-bold text-green-400 tracking-tight sm:tracking-wide md:tracking-widest text-center mb-2 break-all whitespace-normal">^!CR4CK3D!^</div>
                <p class="text-xs text-text-muted mt-2">11 ASCII characters &mdash; hardcoded as QWORD/DWORD immediates</p>
            </div>

            <h3>6.4 Scoring Algorithm</h3>
            <p>The comparison uses a weighted scoring system instead of a simple equality check:</p>
            <div class="bg-[#0a0a0a] p-4 rounded-lg border border-white/5 font-mono text-sm space-y-2">
                <p><strong class="text-white">Match:</strong> <code>score += 10</code></p>
                <p><strong class="text-white">Mismatch:</strong> <code>score -= 1</code></p>
                <p><strong class="text-white">Verdict:</strong> <code>score &gt; 0</code> (strictly greater, via <code>setnle</code>)</p>
            </div>
            <p>For an exact 11-character match: <code>score = 110</code>. For all mismatches: <code>score = -11</code>. The breakeven point is 2 matching characters (<code>score = 20 - 9 = 11 &gt; 0</code>).</p>

            <h3>6.5 Cross-Verification</h3>
            <p>A second function at <code>0x7FF772771790</code> independently constructs the same password:</p>
            <pre><code class="language-x86asm">0x7FF772771794:  mov rax, 0x334B43345243215E
0x7FF7727717B0:  mov [rcx], rax
0x7FF7727717B3:  mov dword ptr [rcx+0x07], 0x5E214433</code></pre>
            <p>Same immediates, same construction. Two independent code paths using identical constants &mdash; confirmed.</p>

            <h2>7. Anti-Debug Mechanisms</h2>

            <h3>7.1 PEB.BeingDebugged Check</h3>
            <p>At <code>0x7FF772771770</code>:</p>
            <pre><code class="language-x86asm">mov  rax, gs:[0x60]       ; PEB
cmp  byte ptr [rax+0x02], 0x00
setnz al
ret</code></pre>
            <p>Classic inline PEB check. Returns 1 if a debugger is attached. Bypass: zero out PEB+2.</p>

            <h3>7.2 CheckRemoteDebuggerPresent</h3>
            <p>Imported via IAT slot at <code>0x7FF772B87000</code>, resolved to <code>kernel32!CheckRemoteDebuggerPresent</code>. Standard Windows API anti-debug. Likely invoked from within the Themida protection layer.</p>

            <h3>7.3 Themida Protection Layer</h3>
            <p>The result-printing function at <code>0x7FF7727717E0</code> calls into the <code>.themida</code> section (<code>0x7FF7729754F3</code>) before rendering output. The return value is tested (<code>test eax, eax</code> / <code>jz</code>), and a non-zero result diverts to an alternate code path.</p>
            <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm">
                <p class="text-yellow-400 font-bold mb-1"><i class="ph ph-warning"></i> Integrity Check</p>
                <p class="text-gray-300">This is likely Themida verifying that the <code>.text</code> section hasn't been tampered with. Runtime patching of the code bytes could trigger this check and cause the failure path regardless of the actual comparison result.</p>
            </div>

            <h2>8. String Encryption System</h2>
            <p>The <code>.rdata</code> section contains multiple encrypted string entries following a consistent format:</p>
            <pre><code class="language-text">[0B] [XX] [39 6A] [encrypted payload...]</code></pre>
            <p>Observed entries at <code>.rdata</code> base + offsets:</p>
            <pre><code class="language-text">0x7FF77283D068: 0B 10 39 6A 33 D3 C8 FC BD E3 ED 0A D7 A3 B4 C4 F2 0E
0x7FF77283D092: 0B 5F 39 6A 04 DB C3 CB F4 FB E9 CB D6 A3 B0 EE F2 8A ...
0x7FF77283D0B0: 0B 61 39 6A 26 CF D4 FC F9 F1 EA CF A4 E2 DE A5 84 BB ...
0x7FF77283D0E0: 0B 7B 39 6A 37 BF F8 C7 F8 F2 ED D5 12 A3 A6 AE B1 ...</code></pre>
            <p>The first entry decrypts to the prompt string (verified). The remaining entries likely contain the success message, failure message, and other UI strings. They are decrypted on-demand and <strong>immediately re-encrypted</strong> after use.</p>

            <h2>9. Patching &mdash; Runtime Patcher</h2>

            <h3>9.1 Why File-Level Patching Is Not Possible</h3>
            <p>The <code>.text</code> section has <code>SizeOfRawData = 0</code> in the PE section headers. There are zero bytes of original code on disk &mdash; Themida generates all ~800 KB of <code>.text</code> content at runtime. Patching the file directly would require reverse-engineering Themida's compression/encryption algorithm or performing a full PE reconstruction from a process dump.</p>
            <p>The practical solution is a <strong>runtime patcher</strong>: a script that launches the binary, waits for Themida to complete unpacking, then patches the live process memory.</p>

            <h3>9.2 Patch Points</h3>
            <p>Two bytes changed at two locations in <code>main()</code>:</p>

            <p><strong>Patch A &mdash; Default Result Override</strong></p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs"></th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">RVA</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Bytes</th>
                            <th class="py-2 font-mono uppercase text-xs">Instruction</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1 text-red-400">Before</td><td class="py-1 font-mono">0xC59A8</td><td class="py-1 font-mono">31 C0</td><td class="py-1"><code>xor eax, eax</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 text-green-400">After</td><td class="py-1 font-mono">0xC59A8</td><td class="py-1 font-mono">B0 01</td><td class="py-1"><code>mov al, 1</code></td></tr>
                    </tbody>
                </table>
            </div>
            <p>Sets the default return value to 1 (success) before the length check.</p>

            <p><strong>Patch B &mdash; Length Check Bypass</strong></p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs"></th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">RVA</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Byte</th>
                            <th class="py-2 font-mono uppercase text-xs">Instruction</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1 text-red-400">Before</td><td class="py-1 font-mono">0xC59B0</td><td class="py-1 font-mono">75</td><td class="py-1"><code>jnz +0x08</code> (conditional)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 text-green-400">After</td><td class="py-1 font-mono">0xC59B0</td><td class="py-1 font-mono">EB</td><td class="py-1"><code>jmp +0x08</code> (unconditional)</td></tr>
                    </tbody>
                </table>
            </div>
            <p>Converts the conditional branch into an unconditional jump. Combined with Patch A, the check function is never reached and <code>al</code> is always 1. <strong>Effect:</strong> any input of any length passes.</p>

            <h3>9.3 Runtime Patcher Implementation</h3>
            <p>A Python script (<code>patch_crackme.py</code>) handles the full patching workflow:</p>
            <ol>
                <li>Spawns <code>crackme-cg.exe</code> in a new console window</li>
                <li>Waits 6 seconds for Themida unpacking to complete</li>
                <li>Enumerates process modules via <code>CreateToolhelp32Snapshot</code> / <code>Module32First</code> to find the image base (ASLR-safe)</li>
                <li>Opens the process with <code>PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_VM_OPERATION</code></li>
                <li>For each patch: reads current bytes, verifies originals, sets <code>PAGE_EXECUTE_READWRITE</code> via <code>VirtualProtectEx</code>, writes new bytes, restores protection, calls <code>FlushInstructionCache</code></li>
                <li>Read-back verification confirms the patch took hold</li>
            </ol>
            <pre><code class="language-python">PATCHES = [
    {
        "rva":  0xC59A8,
        "orig": bytes([0x31, 0xC0]),       # xor eax, eax
        "new":  bytes([0xB0, 0x01]),       # mov al, 1
    },
    {
        "rva":  0xC59B0,
        "orig": bytes([0x75]),             # jnz
        "new":  bytes([0xEB]),             # jmp
    },
]</code></pre>
            <p>Usage:</p>
            <pre><code class="language-text">[*] Starting: crackme-cg.exe
[*] PID: 4812
[*] Waiting for Themida unpack (6s)...
[+] Base: 0x00007FF772770000
[+] PATCHED: Default result @ 0x7FF7728359A8  (31C0 -> B001)
[+] PATCHED: Length check   @ 0x7FF7728359B0  (75 -> EB)
[+] ALL PATCHES APPLIED SUCCESSFULLY!</code></pre>
            <p>In the spawned console:</p>
            <pre><code class="language-text">[>] Sifreyi gir: anything
[+] Tebrikler, crackmeyi cozdun.</code></pre>

            <h2>10. Summary</h2>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Task</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Solution</th>
                            <th class="py-2 font-mono uppercase text-xs">Method</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300">
                        <tr class="border-b border-white/5"><td class="py-2 font-bold">Find the password</td><td class="py-2 text-green-400 font-mono">^!CR4CK3D!^</td><td class="py-2">Extracted from hardcoded QWORD/DWORD immediates in <code>check_password()</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-bold">Patch the binary</td><td class="py-2 text-green-400 font-mono">3 bytes</td><td class="py-2"><code>xor eax,eax</code> &rarr; <code>mov al,1</code> + <code>jnz</code> &rarr; <code>jmp</code></td></tr>
                    </tbody>
                </table>
            </div>
            <p>The Themida protection added significant noise &mdash; a 21 KB file inflating to a 9.5 MB image with encrypted sections, relocated IAT, anti-debug checks, and runtime string encryption. But none of these protections touched the core vulnerability: the password was hardcoded as <strong>plaintext immediate values</strong> in the comparison function. No amount of packing changes the fact that at some point, the CPU needs to compare real bytes against real bytes, and that moment is always observable.</p>

            <div class="mt-12 text-center">
                <p class="text-xl text-white font-bold mb-2">Password: <code class="text-green-400">^!CR4CK3D!^</code></p>
                <p class="text-text-muted italic">dr4gan &mdash; March 2026</p>
            </div>
        </div>
    `
});
