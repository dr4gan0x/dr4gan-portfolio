/**
 * Post: crackme.packed.exe — Unpacking a Custom x64 Crypter with On-Demand Page Decryption
 * Category: Reverse Engineering
 */

window.Dr4ganData.posts.push({
    id: "packed-crypter-unpack",
    title: "crackme.packed.exe — A Custom x64 Crypter, Attach Detection, and Pages That Decrypt Themselves",
    date: "07/25/2026",
    category: "Reverse Engineering",
    tags: ["CrackMe", "PE64", "Windows", "Unpacking", "Custom Crypter", "On-Demand Decryption", "Anti-Debug", "Anti-Dump", "IAT Reconstruction", "FNV-1a", "SplitMix64", "Process Injection", "pefile", "Capstone"],
    description: "A 2.38 MB container hiding a 296 KB statically-linked MSVC console program. Every PE data directory is nulled, the DOS stub is scrubbed, imports resolve by FNV-1a hash, and the payload is unrolled by a SplitMix64 keystream into a private mapping at the original preferred base. The stub refuses to unpack under a debugger, and once it does unpack it re-seals every code page to PAGE_NOACCESS so only executed pages are ever readable. I recovered the complete image by making the target's own fault handler decrypt everything, rebuilt all 87 imports from the live IAT, and produced a standalone binary that matches the original on stdout and exit code across every input.",
    image: null,
    content: `
        <div class="space-y-8">
            <!-- Metadata Block -->
            <div class="bg-white/[0.03] p-4 md:p-6 rounded-xl border border-white/5 font-mono text-xs sm:text-sm space-y-3">
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 border-b border-white/5 pb-2">
                    <span class="text-text-muted shrink-0">Target</span>
                    <span class="text-white break-words sm:text-right">crackme.packed.exe (crackmes.one)</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 border-b border-white/5 pb-2">
                    <span class="text-text-muted shrink-0">Platform</span>
                    <span class="text-white break-words sm:text-right">PE64 / x86-64 / Windows 10 (console)</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 border-b border-white/5 pb-2">
                    <span class="text-text-muted shrink-0">Size</span>
                    <span class="text-white break-words sm:text-right">2,499,072 bytes packed / 0x4A000 (~296 KB) original image</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 border-b border-white/5 pb-2">
                    <span class="text-text-muted shrink-0">Protection</span>
                    <span class="text-white break-words sm:text-right">Scrubbed PE metadata + No IAT + FNV-1a import hashing + SplitMix64 keystream + indirect-call dispatch + debugger-attach detection + on-demand page decryption with NOACCESS sealing + GetModuleHandleW hook + ~2 MB filler</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 border-b border-white/5 pb-2">
                    <span class="text-text-muted shrink-0">Tooling</span>
                    <span class="text-white break-words sm:text-right">Python 3 (pefile, Capstone), hand-rolled Win32 debug loop and process-control tooling</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 pt-1">
                    <span class="text-text-muted shrink-0">Result</span>
                    <span class="text-green-400 font-bold tracking-wider break-words sm:text-right">FULL_IMAGE_RECOVERED + IAT_REBUILT + BEHAVIOR_MATCH</span>
                </div>
            </div>

            <h2>1. Target Overview</h2>
            <p>The brief was narrow: <em>"I only need a detailed write-up from you on how you unpacked it."</em> No serial to recover, no keygen &mdash; the wrapper <em>is</em> the challenge. What makes it worth writing up is that the wrapper is not a commercial packer. It is hand-rolled, it anticipates what an analyst reaches for first, and it has a specific answer for each of those moves.</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Field</th>
                            <th class="py-2 font-mono uppercase text-xs">Value</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">md5</td><td class="py-2"><code>3023ac03a6ca2cfbbd8ecb418b0aaffa</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">sha1</td><td class="py-2"><code>810a6562d838815283eac9043c8b6cfbc5abe1c2</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">sha256</td><td class="py-2"><code>72e147de2599f51f12caabb22c5a5c258ebb33f37bd479184b1e39976adc2375</code></td></tr>
                    </tbody>
                </table>
            </div>
            <p>Off-the-shelf identification contradicts itself, and the contradiction is the first useful signal. DIE calls the file <em>Microsoft Linker 15.22 / MSVC C/C++</em> and then flags a custom DOS stub, no IAT, an <code>RWX</code> <code>.data</code>, an empty exceptions directory, repeating section names, one compressed section and high entropy. ExeInfoPE is blunter:</p>
            <pre><code class="language-text">x64 [ Import ZERO size ] *Unknown exe , EP : 40 55 .. , 07 sections
[ MZ Header Tampared cleaned ! - Don't trust this file ]</code></pre>
            <p>A real MSVC build does not have zero imports. Something wrapped an ordinary program and then went back and erased its own fingerprints.</p>
            <p>The runtime contract is two prompts:</p>
            <pre><code class="language-text">&gt; test
&gt; test

&gt;
&gt;
[-] Keys cannot be empty!</code></pre>

            <h2>2. Reading the Outer Shell</h2>

            <h3>2.1 The Scrubbed DOS Header</h3>
            <p>Parsing the container headers directly rather than trusting a scanner:</p>
            <pre><code class="language-text">e_magic  = 'MZ'      e_lfanew = 0xC0
PE sig @ e_lfanew    = 50 45 00 00
'This program cannot be run in DOS mode' in first 256 bytes: False</code></pre>
            <p>The <code>MZ</code> magic and a valid <code>PE</code> signature are intact, but the 14-instruction DOS stub that normally prints the "cannot be run in DOS mode" line is gone. That is the "tampered MZ". It changes nothing at execution time and exists purely to break signature matching on the stub bytes.</p>

            <h3>2.2 Every Data Directory Is Nulled</h3>
            <pre><code class="language-text">[ 0] EXPORT        rva 0x0   size 0    (empty)
[ 1] IMPORT        rva 0x0   size 0    (empty)   &lt;-- No IAT
[ 3] EXCEPTION     rva 0x0   size 0    (empty)
[ 5] BASERELOC     rva 0x0   size 0    (empty)
[12] IAT           rva 0x0   size 0    (empty)
 ... all 16 entries zero ...</code></pre>
            <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm">
                <p class="text-yellow-400 font-bold mb-1"><i class="ph ph-warning"></i> What an Empty Directory Table Actually Means</p>
                <p class="text-gray-300">A statically-linked x64 MSVC binary always carries at least an import directory and, in practice, a <code>.pdata</code> exception directory for SEH unwinding. Zeroing all sixteen means the Windows loader does <em>nothing</em> for this image &mdash; no import binding, no exception-table registration, no relocation. Every job the loader normally performs has to be done from inside the file, by code that runs before the real program. That code is the target of this analysis.</p>
            </div>

            <h3>2.3 Section Table and Entropy Map</h3>
            <p>Seven sections, read by entropy rather than by name:</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Name</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">RVA</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">VSize</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Flags</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Entropy</th>
                            <th class="py-2 font-mono uppercase text-xs">Reality</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.fini</td><td class="py-1"><code>0x1000</code></td><td class="py-1"><code>0x3b326</code></td><td class="py-1">R-X</td><td class="py-1 text-red-400 font-bold">7.999</td><td class="py-1">Encrypted blob, not code</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.text</td><td class="py-1"><code>0x3d000</code></td><td class="py-1"><code>0x37864</code></td><td class="py-1">R-X</td><td class="py-1">5.485</td><td class="py-1">The only real code &mdash; the stub. EP here</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.data</td><td class="py-1"><code>0x75000</code></td><td class="py-1"><code>0xfa6b7</code></td><td class="py-1 text-red-400 font-bold">RWX</td><td class="py-1">7.847</td><td class="py-1">1 MB writable+executable scratch</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.pdata</td><td class="py-1"><code>0x170000</code></td><td class="py-1"><code>0xaefcf</code></td><td class="py-1">R--</td><td class="py-1">6.428</td><td class="py-1">Filler (exceptions dir is empty)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.rdata</td><td class="py-1"><code>0x21f000</code></td><td class="py-1"><code>0x3040</code></td><td class="py-1">RW-</td><td class="py-1">0.147</td><td class="py-1">Runtime slots, near-empty on disk</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.fini</td><td class="py-1"><code>0x223000</code></td><td class="py-1"><code>0x40</code></td><td class="py-1">RW-</td><td class="py-1">0.862</td><td class="py-1">Duplicate section name</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.xd</td><td class="py-1"><code>0x224000</code></td><td class="py-1"><code>0x452d0</code></td><td class="py-1">R--</td><td class="py-1 text-red-400 font-bold">7.964</td><td class="py-1">Manifest + original PE headers</td></tr>
                    </tbody>
                </table>
            </div>
            <p>Entropy at 7.999 over 237 KB is not compression artefacting, it is a stream cipher. The <code>R-X</code> flag on <code>.fini</code> is decoration; nothing there disassembles. Conversely <code>.text</code> at 5.485 is the classic profile of x86-64 machine code, and the entry point at RVA <code>0x3D000</code> lands exactly on its first byte.</p>
            <p>One number outweighs all the flags. The container is 2.38 MB; the program it hides is <code>0x4A000</code> bytes. Roughly two megabytes of this file is filler. Crypters inflate deliberately &mdash; it breaks size heuristics and it makes an analyst assume the payload is large when it is small and buried.</p>

            <h2>3. The Loader Stub</h2>
            <p>Entry point at RVA <code>0x3D000</code>, file offset <code>0x3B800</code>:</p>
            <pre><code class="language-text">40 55 53 56 57 41 54 41 55 41 56 41 57 48 8d ac 24 88 f1 ff ff
48 81 ec 78 0f 00 00 45 33 d2 c7 45 90 c5 9d 1c 81 ...</code></pre>
            <p>Disassembled from <code>0x14003D000</code>:</p>
            <pre><code class="language-x86asm">14003d000  push  rbp
14003d002  push  rbx / rsi / rdi / r12..r15     ; full non-volatile save
14003d00d  lea   rbp, [rsp - 0xe78]
14003d015  sub   rsp, 0xf78                      ; large frame
14003d01c  xor   r10d, r10d
14003d01f  mov   dword [rbp-0x70], 0x811c9dc5    ; FNV-1a 32-bit offset basis
14003d035  movabs r13, 0xa5f0d3c29b8e5617
14003d082  rdtsc
14003d088  movabs rcx, 0xcafebabedeadbeef
14003d0bc  movabs rcx, 0xbf58476d1ce4e5b9        ; SplitMix64 multiplier #1
14003d0d8  movabs rax, 0x94d049bb133111eb        ; SplitMix64 multiplier #2
14003d0f6  rdtsc</code></pre>
            <p>Three constants identify the design without guesswork:</p>
            <ul>
                <li><code>0x811C9DC5</code> &mdash; the FNV-1a 32-bit offset basis. Combined with a completely absent import table, imports are resolved at runtime by hashing export names. A string sweep of <code>.text</code> confirms it: there are no API names in the section at all, only disassembly noise such as <code>D$8H3</code> (ASCII coincidences inside <code>48 33</code> byte sequences).</li>
                <li><code>0xBF58476D1CE4E5B9</code> and <code>0x94D049BB133111EB</code> &mdash; both SplitMix64 magic multipliers. The stub seeds a SplitMix64 stream and uses it as the keystream that unrolls the encrypted sections.</li>
                <li><code>0xCAFEBABEDEADBEEF</code> &mdash; a whitening constant inside the mixing loop.</li>
            </ul>
            <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm">
                <p class="text-red-400 font-bold mb-1"><i class="ph ph-shield-warning"></i> No Direct Calls Anywhere</p>
                <p class="text-gray-300">A linear sweep of the first ~1200 instructions returns <strong>zero direct call targets</strong>. Every call is indirect. Around <code>0x14003D698</code> the stub performs a run of <code>lea reg, [rip+disp]</code> loads resolving to a table of handler routines &mdash; <code>0x1400739AD</code>, <code>0x14005B97C</code>, <code>0x14005A10C</code>, <code>0x14004FEA0</code>, <code>0x14004D9CA</code>, <code>0x140044C08</code>, <code>0x1400437DC</code>, <code>0x140041D32</code>, <code>0x14003EA82</code>, <code>0x14006E194</code> &mdash; all dispatched through registers. The call graph does not exist statically; it is assembled at runtime.</p>
            </div>
            <p>Walking that dispatch table instruction by instruction is possible, but the stub is deterministic and will happily build the real image if allowed to run. The better use of time is finding what it operates on.</p>

            <h2>4. The <code>.xd</code> Section Is the Packer's Own Manifest</h2>
            <p><code>.xd</code> sits at 7.964 entropy, yet a full-file string sweep produced exactly one hit inside it &mdash; and it is the right one:</p>
            <pre><code class="language-text">0x21d11d (.xd): "!This program cannot be run in DOS mode."</code></pre>
            <p>That string does not belong to the container, whose stub was scrubbed. It belongs to the <em>original</em> program. Dumping around it:</p>
            <pre><code class="language-text">0021d0d0  4d 5a 90 00 03 00 00 00 04 00 00 00 ff ff 00 00  MZ..............
0021d110  0e 1f ba 0e 00 b4 09 cd 21 b8 01 4c cd 21 54 68  ........!..L.!Th
0021d120  69 73 20 70 72 6f 67 72 61 6d 20 63 61 6e 6e 6f  is program canno
0021d130  74 20 62 65 20 72 75 6e 20 69 6e 20 44 4f 53 20  t be run in DOS
0021d1b0  52 69 63 68 ...                                   Rich header
0021d1d0  50 45 00 00 64 86 06 00 ...                       PE.., x64, 6 sections</code></pre>
            <p>The original PE headers &mdash; MZ, the genuine DOS stub, the MSVC Rich header and the NT headers &mdash; are stored verbatim and unencrypted at file offset <code>0x21D0D0</code>. The 720 bytes in front of them are a structured header:</p>
            <pre><code class="language-c">// .xd @ file 0x21CE00
struct manifest {
    uint32_t magic;         // 0x81A2D3C4
    uint32_t version;       // 0x00010000
    uint32_t header_size;   // 0xD8
    uint32_t block_count;   // 6   &lt;- equals the original's section count
    uint32_t checksum;      // 0x3D9C2651
    uint32_t f20;           // 0x45000
    uint64_t image_base;    // 0x0000000140000000
    uint64_t size_of_image; // 0x000000000004A000
    uint64_t key;           // 0x2953ED2D4F041530
    // followed by 6 block descriptors
};</code></pre>
            <p>Each of the six descriptors is a copy of an original section header trailed by a per-section key, with the section names sitting in cleartext. That hands over the entire original layout:</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Name</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">VA</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">VSize</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">RawSz</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">RawPtr</th>
                            <th class="py-2 font-mono uppercase text-xs">Char</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.text</td><td class="py-1"><code>0x1000</code></td><td class="py-1"><code>0x2d448</code></td><td class="py-1"><code>0x2d600</code></td><td class="py-1"><code>0x400</code></td><td class="py-1"><code>0x60000020</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.rdata</td><td class="py-1"><code>0x2f000</code></td><td class="py-1"><code>0x12c66</code></td><td class="py-1"><code>0x12e00</code></td><td class="py-1"><code>0x2da00</code></td><td class="py-1"><code>0x40000040</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.data</td><td class="py-1"><code>0x42000</code></td><td class="py-1"><code>0x2ab0</code></td><td class="py-1"><code>0x1400</code></td><td class="py-1"><code>0x40800</code></td><td class="py-1"><code>0xc0000040</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.pdata</td><td class="py-1"><code>0x45000</code></td><td class="py-1"><code>0x2628</code></td><td class="py-1"><code>0x2800</code></td><td class="py-1"><code>0x41c00</code></td><td class="py-1"><code>0x40000040</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.fptable</td><td class="py-1"><code>0x48000</code></td><td class="py-1"><code>0x100</code></td><td class="py-1"><code>0x200</code></td><td class="py-1"><code>0x44400</code></td><td class="py-1"><code>0xc0000040</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-1 font-mono">.reloc</td><td class="py-1"><code>0x49000</code></td><td class="py-1"><code>0x9c4</code></td><td class="py-1"><code>0xa00</code></td><td class="py-1"><code>0x44600</code></td><td class="py-1"><code>0x42000040</code></td></tr>
                    </tbody>
                </table>
            </div>
            <p>Parsing the embedded NT headers fills in the rest:</p>
            <pre><code class="language-text">Machine              0x8664 (x64)
NumberOfSections     6
AddressOfEntryPoint  0xC8FC        -&gt;  OEP VA = 0x14000C8FC
ImageBase            0x140000000
SizeOfImage          0x4A000
SizeOfHeaders        0x400
Subsystem            3 (console)

Original data directories (the real ones):
  IMPORT      rva 0x41334  size 40
  EXCEPTION   rva 0x45000  size 9768
  BASERELOC   rva 0x49000  size 2500
  DEBUG       rva 0x3CCA0  size 28
  LOAD_CONFIG rva 0x3CB60  size 320
  IAT         rva 0x2F000  size 704</code></pre>
            <div class="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-sm">
                <p class="text-green-400 font-bold mb-1"><i class="ph ph-check-circle"></i> The Whole Recipe, In One Blob</p>
                <p class="text-gray-300">The container ships a manifest describing the original image, the original's headers in cleartext, and the original's section bodies encrypted across the high-entropy sections. The stub walks the manifest, decrypts each block into a mapping at <code>ImageBase</code>, registers the exception table, resolves imports by hash, and transfers to <code>0x14000C8FC</code>. Having the OEP up front is what makes everything after this tractable.</p>
            </div>

            <h2>5. Where the Real Program Lands</h2>
            <p>The container's <code>ImageBase</code> is <code>0x140000000</code> and so is the original's. Running the sample as a plain child process and reading its PEB shows <code>PEB.ImageBaseAddress = 0x140000000</code>, while a toolhelp module snapshot places <code>crackme.packed.exe</code> at an ASLR address such as <code>0x7FF697C70000</code>.</p>
            <p>Both are true at once. Windows maps the container wherever it maps it; the stub then builds the reconstructed program at the original's preferred base <code>0x140000000</code> and patches <code>PEB.ImageBaseAddress</code> to point there, so the original CRT &mdash; which calls <code>GetModuleHandleW(NULL)</code> during startup &mdash; believes it is the main module.</p>
            <p>Because the reconstruction lands exactly on its own <code>ImageBase</code>, the relocation delta is zero and no fixups are applied. The decrypted bytes are therefore identical to what the original file's sections would hold on disk, and a dump needs no rebasing. Reading the OEP out of the live process:</p>
            <pre><code class="language-x86asm">14000c8fc  sub  rsp, 0x28
14000c900  call 0x14000d0f0         ; __security_init_cookie
14000c905  add  rsp, 0x28
14000c909  jmp  __scrt_common_main_seh</code></pre>
            <p>Textbook <code>mainCRTStartup</code>. The hidden program is an ordinary statically-linked MSVC console binary and the stub hands control to its genuine CRT entry.</p>

            <h2>6. Why the Debugger Was the Wrong Tool</h2>
            <p>The obvious first move: attach, drop a hardware breakpoint on the OEP, run to it, dump. I built a minimal debugger on the Win32 debug loop (<code>CreateProcess</code> with <code>DEBUG_ONLY_THIS_PROCESS</code>, <code>WaitForDebugEvent</code> / <code>ContinueDebugEvent</code>) and armed <code>Dr0 = base + 0xC8FC</code> through <code>SetThreadContext</code>, after clearing <code>PEB.BeingDebugged</code> and <code>PEB.NtGlobalFlag</code>.</p>
            <p>The breakpoint never fired, and polling showed why &mdash; the image never decrypted at all:</p>
            <pre><code class="language-text">[*] CREATE_PROCESS base=0x7ff697c70000 oep=0x7ff697c7c8fc
    PEB=0x700c690000 -&gt; BeingDebugged/NtGlobalFlag cleared
    HW BP armed @ 0x7ff697c7c8fc
    [.] idle, OEP not yet decrypted (t=4s)
    [.] idle, OEP not yet decrypted (t=44s)
[!] budget exceeded (decrypted? False)</code></pre>
            <p>I re-ran with no hardware breakpoint at all &mdash; attach only, PEB patched, nothing else touched. Same outcome: 45 seconds, no decryption. The trigger is neither the debug registers nor the PEB flags.</p>
            <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm">
                <p class="text-red-400 font-bold mb-1"><i class="ph ph-shield-warning"></i> Attach Detection, Not Flag Detection</p>
                <p class="text-gray-300">Clearing <code>BeingDebugged</code> and <code>NtGlobalFlag</code> defeats the PEB-reading checks. It does not defeat a query against the debug port or debug object &mdash; <code>NtQueryInformationProcess</code> with <code>ProcessDebugPort</code>, <code>ProcessDebugObjectHandle</code> or <code>ProcessDebugFlags</code> reports the kernel debug object regardless of what the PEB says. Getting past that class of check means hooking the syscall path, which is a lot of blind work for no benefit here.</p>
            </div>
            <p>The clean answer to an attach check is to not attach. Everything the extraction needs is reachable through a full-access handle on a child launched normally, without ever becoming its debugger:</p>
            <pre><code class="language-text">CreateProcessW(..., CREATE_NEW_CONSOLE, ...)     // no DEBUG_* flags
NtQueryInformationProcess -&gt; PEB -&gt; ImageBaseAddress
ReadProcessMemory / WriteProcessMemory
VirtualQueryEx / VirtualProtectEx
VirtualAllocEx / CreateRemoteThread
OpenThread / SuspendThread</code></pre>
            <p>Launched this way <code>PEB.BeingDebugged</code> is genuinely zero, there is no debug object, the anti-debug path stays quiet, and the OEP prologue <code>48 83 EC 28</code> appears within a fraction of a second of process start.</p>

            <h2>7. The Anti-Dump: Pages That Decrypt Themselves</h2>
            <p>Getting it to unpack was the easy half. Getting a <em>complete</em> image out of it was not.</p>
            <p>Dumps came out inconsistent in a way that ruled out a simple race. A dump taken while the process sat blocked on its first prompt had most of <code>.text</code> populated with a handful of zero-filled pages. A dump taken the instant the OEP prologue appeared had <code>.text</code> almost entirely zero, with only the OEP page, <code>.data</code>, <code>.pdata</code> and <code>.reloc</code> present. Same binary, same base, two very different snapshots &mdash; the image was mutating underneath the reads.</p>
            <p>Mapping page state with <code>VirtualQueryEx</code> settled it. Immediately after decryption completed:</p>
            <pre><code class="language-text">0x140000000  0x001000  COMMIT  RW      ; headers
0x140001000  0x02e000  COMMIT  RX      ; .text  -- one clean region
0x14002f000  0x013000  COMMIT  R       ; .rdata
0x140042000  0x003000  COMMIT  RW      ; .data
0x140045000  0x003000  COMMIT  R       ; .pdata</code></pre>
            <p>After the process had run into its input prompt:</p>
            <pre><code class="language-text">0x140001000  0x006000  COMMIT  RX
0x140007000  0x002000  COMMIT  NOACCESS      &lt;-- sealed
0x140009000  0x006000  COMMIT  RX
0x14000f000  0x002000  COMMIT  NOACCESS      &lt;-- sealed
0x140011000  0x002000  COMMIT  RX
0x140013000  0x001000  COMMIT  NOACCESS      &lt;-- sealed
0x140014000  0x014000  COMMIT  RX
... 17 pages NOACCESS across .text and .rdata ...</code></pre>
            <p>The single clean <code>RX</code> region fragments into executed pages interleaved with <code>NOACCESS</code> holes, and <code>ReadProcessMemory</code> fails on the holes &mdash; which is precisely why the earlier dumps had zero-filled gaps. The gaps line up one-to-one with code that had not executed yet.</p>
            <p>To determine whether the holes were empty or hiding something, I flipped one to readable from outside and looked underneath:</p>
            <pre><code class="language-text">page 0x7000  VirtualProtectEx -&gt; PAGE_EXECUTE_READWRITE (was 0x01 NOACCESS)
  bytes: 2f 4c 40 6d 01 40 dd e0 36 4b bf 25 2c 1d d9 ef ...
  entropy(64B) = 5.60   zero% = 0%
  verdict: ENCRYPTED</code></pre>
            <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm">
                <p class="text-red-400 font-bold mb-1"><i class="ph ph-shield-warning"></i> The Mechanism</p>
                <p class="text-gray-300">The stub decrypts the whole image once, then re-seals the code pages to <code>PAGE_NOACCESS</code> with their <strong>encrypted</strong> contents restored underneath. A vectored handler installed by the packer decrypts each page in place the first time the process faults on it, then flips it to <code>RX</code>. Pages that never execute &mdash; here, the key-validation logic that only runs after input is accepted &mdash; stay encrypted forever behind the guard. No single snapshot can ever contain them. It is an anti-dump that rides on normal execution.</p>
            </div>
            <p>One detail matters for anyone reproducing this: <code>VirtualProtectEx</code> from outside only changes protection. It does not invoke the target's handler, so unsealing a page that way exposes ciphertext, not code. The handler runs only when the <em>target itself</em> faults.</p>

            <h2>8. Forcing the Entire Image to Decrypt</h2>
            <p>The handler keys off the faulting address, and it services a <em>read</em> fault, not just an execute fault. That is the lever. If the target can be made to touch every page &mdash; without executing any of the unknown code &mdash; the handler decrypts all of it in place, and a plain <code>ReadProcessMemory</code> sweep captures everything.</p>
            <p>So I injected a thread whose only job is to read one byte from every page of the reconstructed image. Allocate a page in the target with <code>VirtualAllocEx(PAGE_EXECUTE_READWRITE)</code>, write a stub, start it with <code>CreateRemoteThread</code>:</p>
            <pre><code class="language-x86asm">        mov   rax, 0x140000000
        mov   rdx, 0x14004a000
touch:  movzx ecx, byte [rax]   ; read fault on a NOACCESS page -&gt; handler decrypts it
        add   rax, 0x1000
        cmp   rax, rdx
        jb    touch
        xor   eax, eax
        ret</code></pre>
            <p>Reads only. No jump into any decrypted page, so there is no chance of executing a random slice of the program. The result:</p>
            <pre><code class="language-text">pre  NOACCESS pages: 0x7000 0x8000 0xf000 0x10000 0x13000 0x28000 0x2b000
                     0x2e000 0x31000 0x32000 0x37000 0x38000 0x39000 0x3a000
                     0x3b000 0x3d000 0x41000        (17 pages)
remote thread exit  : 0x0
post NOACCESS pages : []                            (none)
.text zero pages    : none
0xd0f0              : 48 89 5c 24 18 55 48 8b ec 48 83 ec 30 ...
entropy(page 0x7000): 5.60 -&gt; 6.36</code></pre>
            <div class="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-sm">
                <p class="text-green-400 font-bold mb-1"><i class="ph ph-check-circle"></i> Every Guard Page Fell</p>
                <p class="text-gray-300">The <code>NOACCESS</code> count went from 17 to zero, the <code>.text</code> zero-page count went to zero, and page <code>0x7000</code> dropped from a ciphertext-like 5.60 to a code-like 6.36. <code>0x14000D0F0</code> &mdash; the <code>call</code> target from the OEP that had been a guard hole in every prior dump &mdash; is now the prologue of <code>__security_init_cookie</code>. A full read of <code>[0x140000000, 0x14004A000)</code> finally returns the complete decrypted image.</p>
            </div>

            <h2>9. Getting <code>.data</code> Before the Runtime Dirties It</h2>
            <p>The force-decrypted dump has perfect code and the wrong <code>.data</code>. By the time every page has been touched, the process has executed CRT startup and part of <code>main</code>, so <code>.data</code> holds live runtime state &mdash; an initialised heap handle, encoded function pointers, one-time-init guards. Bake that in as a section's on-disk contents and a fresh process trips over its own stale state during CRT init. That was exactly the failure mode of my first rebuild: it died with <code>0xC0000005</code> before printing a single byte.</p>
            <p><code>.data</code> at the very first instruction of the OEP, before any CRT code runs, is by definition the image's initial <code>.data</code> &mdash; the same bytes the original file would carry on disk. To capture that instant without a debugger, I trapped the process at the OEP with a two-byte self-park. Poll for the OEP prologue, and the moment it appears overwrite the entry with <code>EB FE</code> (<code>jmp $</code>):</p>
            <pre><code class="language-text">poll 0x14000c8fc until it reads 48 83 ec 28
save original 2 bytes -&gt; write EB FE -&gt; FlushInstructionCache
suspend all threads   -&gt; confirm RIP == 0x14000C8FC
read .data            -&gt; restore the saved bytes in the dump</code></pre>
            <p>When the stub's tail transfer reaches the OEP, the thread spins in place instead of entering the CRT. Suspending it there and confirming <code>RIP == 0x14000C8FC</code> gives <code>.data</code> in its pristine state; restoring the two saved bytes in the dump keeps <code>.text</code> at the OEP correct.</p>
            <p>The final image is the obvious composition &mdash; code and read-only data from the force-decrypted dump, <code>.data</code> from the OEP spin-trap dump:</p>
            <pre><code class="language-text">combined -&gt; oep_image.bin
  .text  0x1000 : 48 83 ec 28 48 8d 0d f5 22 04 00 e8 b8 8c 00 00
  0xd0f0        : 48 89 5c 24 18 55 48 8b ec 48 83 ec 30 48 8b 05
  .data  0x42000: 40 f7 02 40 01 00 00 00 05 00 00 00 00 00 00 00  (pristine)
  .text zero pages: none</code></pre>

            <h2>10. Rebuilding the Import Table</h2>
            <p>The container ships with no import directory, and the reconstructed image has the IAT slots at <code>0x2F000</code> filled with absolute addresses but no descriptors, no INT and no name strings &mdash; the stub resolved everything by hash and wrote pointers straight into the IAT. To produce a standalone binary the loader can bind, all of that has to be rebuilt from the resolved pointers.</p>
            <p>The original header gives the IAT as RVA <code>0x2F000</code>, size <code>0x2C0</code> &mdash; 88 slots, 87 used plus a null terminator. I read those 87 pointers from the live process and resolved each against the loaded modules. Only three modules are mapped:</p>
            <pre><code class="language-text">ntdll.dll         base 0x7ffdcaa90000  size 0x21f000
KERNEL32.DLL      base 0x7ffdca190000  size 0x94000
KERNELBASE.dll    base 0x7ffdc8290000  size 0x3ba000</code></pre>
            <p>No <code>ucrtbase</code>, no <code>vcruntime</code>, no <code>msvcp</code> &mdash; confirming a statically linked (<code>/MT</code>) build whose only import DLL is <code>KERNEL32.dll</code>. Matching each pointer against the owning module's export table by RVA:</p>
            <pre><code class="language-text">[ 0] 0x2f000  KERNEL32  VirtualAlloc          [43] 0x2f158  KERNEL32  GetStdHandle
[ 1] 0x2f008  KERNEL32  VirtualFree           [45] 0x2f168  KERNEL32  GetModuleFileNameW
[ 3] 0x2f018  ntdll     RtlEnterCriticalSection
[ 7] 0x2f038  ntdll     RtlEncodePointer      [71] 0x2f238  KERNEL32  ReadConsoleW
[41] 0x2f148  KERNEL32  GetProcAddress        [85] 0x2f2a8  KERNEL32  CreateFileW
...</code></pre>
            <p>Nine slots resolved into <code>ntdll</code> &mdash; <code>RtlEnterCriticalSection</code>, <code>RtlEncodePointer</code>, <code>RtlAllocateHeap</code> and friends. Those are not what the original imported; they are where <code>kernel32</code>'s forwarders land. The original imported the <code>kernel32</code> wrappers. I rebuilt the true names by parsing <code>kernel32</code>'s export table <em>including</em> forwarder strings and mapping each <code>ntdll.RtlXxx</code> target back to the <code>kernel32</code> export that forwards to it:</p>
            <pre><code class="language-text">ntdll.RtlEnterCriticalSection   -&gt;  KERNEL32.EnterCriticalSection
ntdll.RtlLeaveCriticalSection   -&gt;  KERNEL32.LeaveCriticalSection
ntdll.RtlDeleteCriticalSection  -&gt;  KERNEL32.DeleteCriticalSection
ntdll.RtlEncodePointer          -&gt;  KERNEL32.EncodePointer
ntdll.RtlDecodePointer          -&gt;  KERNEL32.DecodePointer
ntdll.RtlInitializeSListHead    -&gt;  KERNEL32.InitializeSListHead
ntdll.RtlAllocateHeap           -&gt;  KERNEL32.HeapAlloc
ntdll.RtlReAllocateHeap         -&gt;  KERNEL32.HeapReAlloc
ntdll.RtlSizeHeap               -&gt;  KERNEL32.HeapSize</code></pre>
            <p>After the remap all 87 slots belong to <code>KERNEL32.dll</code> &mdash; exactly the import profile a <code>/MT</code> MSVC console app should have, and clean enough to emit as a single import descriptor.</p>

            <h3>10.1 The One Slot That Resisted</h3>
            <p>Slot 28 pointed into the container's own body rather than any system DLL. Reading it as code:</p>
            <pre><code class="language-x86asm">7ff697ca84a0  test rcx, rcx              ; lpModuleName
7ff697ca84a3  jne  0x7ff697ca84b1        ; named module -&gt; real path
7ff697ca84a5  mov  rax, [rip+0x1e97bc]   ; cached (fake) main module base
7ff697ca84ac  test rax, rax
7ff697ca84af  jne  0x7ff697ca84b6
7ff697ca84b1  jmp  0x7ff697ca7ed0        ; real GetModuleHandleW
7ff697ca84b6  ret</code></pre>
            <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm">
                <p class="text-blue-400 font-bold mb-1"><i class="ph ph-key"></i> A GetModuleHandleW Hook</p>
                <p class="text-gray-300">When the CRT calls <code>GetModuleHandleW(NULL)</code>, the trampoline returns the cached fake base <code>0x140000000</code> so the unpacked program sees itself as the main module; any named lookup falls through to the genuine API. That identifies slot 28 as <code>GetModuleHandleW</code>. For a standalone rebuild the real <code>kernel32!GetModuleHandleW</code> is what belongs there, so that is the name emitted.</p>
            </div>

            <h2>11. Reassembling a Runnable PE</h2>
            <p>With a complete decrypted image and a full 87-entry import list, the rebuild is mechanical but has to be exact.</p>
            <p>I laid the file out <strong>memory-aligned</strong> &mdash; <code>FileAlignment = SectionAlignment = 0x1000</code>, each section's raw offset equal to its RVA &mdash; so the on-disk bytes equal the in-memory image and the dump maps 1:1. The six original sections come straight from the combined dump. A seventh section, <code>.idata</code>, is appended at RVA <code>0x4A000</code> holding a single <code>IMAGE_IMPORT_DESCRIPTOR</code> for <code>KERNEL32.dll</code>, the 87-entry INT, and the hint/name strings. The descriptor's <code>FirstThunk</code> points back at the original IAT at <code>0x2F000</code>, so the loader repopulates the exact slots the code already references and no call site needs patching. The INT is laid out in slot order, so <code>IAT[i]</code> binds to the function the stub had placed there.</p>
            <pre><code class="language-text">FILE_HEADER.NumberOfSections   6 -&gt; 7
OPTIONAL.FileAlignment         0x200 -&gt; 0x1000
OPTIONAL.SizeOfHeaders         -&gt; 0x1000
OPTIONAL.SizeOfImage           -&gt; 0x4B000
DataDirectory[IMPORT]          rva 0x4A000, size 0x28
DataDirectory[IAT]             rva 0x2F000, size 0x2C0
DataDirectory[DEBUG]           zeroed (its raw pointer is meaningless in a dump)
.rdata characteristics         |= IMAGE_SCN_MEM_WRITE   (loader writes the IAT here)</code></pre>
            <p>The original <code>EXCEPTION</code> (<code>.pdata</code>), <code>BASERELOC</code> (<code>.reloc</code>) and <code>LOAD_CONFIG</code> directories are kept intact &mdash; the data behind them is present in the dump and correct. Keeping <code>.reloc</code> with <code>ImageBase = 0x140000000</code> means the rebuilt file is properly relocatable even though this sample happens to land on its preferred base.</p>
            <p>Re-parsing the result:</p>
            <pre><code class="language-text">Machine 0x8664   Sections 7   AddressOfEntryPoint 0xc8fc   ImageBase 0x140000000
SizeOfImage 0x4b000
IMPORT KERNEL32.dll: 87
has EXCEPTION dir: True   |   BASERELOC: True</code></pre>

            <h2>12. Verification</h2>
            <p>Metadata parsing proves structure, not correctness. The real test is behaviour, so I drove the rebuilt binary and the original container with identical stdin and compared stdout and exit codes:</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Input</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Packed</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Unpacked</th>
                            <th class="py-2 font-mono uppercase text-xs">Match</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">(two empty lines)</td><td class="py-2">rc=1 &middot; <code>"&gt; &gt; [-] Keys cannot be empty!"</code></td><td class="py-2">rc=1 &middot; identical</td><td class="py-2 text-green-400 font-bold">YES</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">test / test</td><td class="py-2">rc=0xC0000409 &middot; <code>"&gt; &gt; "</code></td><td class="py-2">rc=0xC0000409 &middot; identical</td><td class="py-2 text-green-400 font-bold">YES</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">AAAA / BBBB</td><td class="py-2">rc=0xC0000409 &middot; <code>"&gt; &gt; "</code></td><td class="py-2">rc=0xC0000409 &middot; identical</td><td class="py-2 text-green-400 font-bold">YES</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">hello</td><td class="py-2">rc=1 &middot; <code>"&gt; &gt; [-] Keys cannot be empty!"</code></td><td class="py-2">rc=1 &middot; identical</td><td class="py-2 text-green-400 font-bold">YES</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">1234 / 5678</td><td class="py-2">rc=0xC0000005 &middot; <code>"&gt; &gt; "</code></td><td class="py-2">rc=0xC0000005 &middot; identical</td><td class="py-2 text-green-400 font-bold">YES</td></tr>
                    </tbody>
                </table>
            </div>
            <p>The match is exact, down to the crackme's own failure modes. The <code>0xC0000409</code> (<code>STATUS_STACK_BUFFER_OVERRUN</code>, an intentional <code>__fastfail</code>) it raises on some inputs and the <code>0xC0000005</code> it throws on others are reproduced identically. That behaviour is driven by the very validation code that lived in the guard-page holes, which is only possible because the forced decryption recovered it.</p>
            <p>The static profile is back to something an ordinary binary would show:</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Section</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Entropy (packed)</th>
                            <th class="py-2 font-mono uppercase text-xs">Entropy (unpacked)</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">.text</td><td class="py-2">7.999 / 5.485</td><td class="py-2 text-green-400">6.444</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">.rdata</td><td class="py-2">0.147</td><td class="py-2 text-green-400">5.111</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">.data</td><td class="py-2">7.847</td><td class="py-2 text-green-400">1.354</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">.pdata</td><td class="py-2">6.428</td><td class="py-2 text-green-400">4.651</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">.reloc</td><td class="py-2">&mdash;</td><td class="py-2 text-green-400">4.129</td></tr>
                    </tbody>
                </table>
            </div>
            <p>The high-entropy blobs are gone, the import table lists 87 named <code>KERNEL32</code> functions, the exception and relocation directories are populated, and the program's own strings are in cleartext where the container had hidden them:</p>
            <pre><code class="language-text">'[-] Keys cannot be empty!'
'[*] Decrypted ou...'
'ETFlagf'
'success'</code></pre>
            <div class="flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-white/5 rounded-xl border border-white/5 my-6 w-full overflow-x-auto">
                <div class="text-sm sm:text-lg md:text-2xl lg:text-3xl font-mono font-bold text-green-400 tracking-tight sm:tracking-wide md:tracking-widest text-center mb-2 break-all whitespace-normal">ALL OUTPUTS MATCH</div>
                <p class="text-xs text-text-muted mt-2">crackme.unpacked.exe &mdash; 307,200 bytes, 7 sections, 87 KERNEL32 imports, entry 0x000C8FC</p>
            </div>

            <h2>13. Pipeline</h2>
            <p>Environment: Windows 10 x64, Python 3.14, <code>pefile</code>, <code>Capstone</code>. Everything else is small native tooling written against <code>kernel32</code> / <code>ntdll</code>.</p>
            <pre><code class="language-text">01  parse container: sections, data directories, entropy map
02  string sweep: no plaintext API names (FNV-1a imports) + the .xd leak
03  disassemble EP stub: FNV-1a basis, SplitMix64 constants, indirect dispatch
04  carve .xd: manifest struct + embedded original PE headers
05  parse embedded headers: OEP 0xC8FC, section table, original data directories
06  launch as a plain child; resolve reconstructed base via PEB.ImageBaseAddress
07  force decrypt: VirtualAllocEx + CreateRemoteThread read-loop over every page
08  spin-trap the OEP (EB FE) and dump pristine .data
09  combine: full code + pristine .data
10  read live IAT (87 slots); resolve to exports; remap kernel32 forwarders
11  identify the GetModuleHandleW hook (slot 28) from its trampoline
12  rebuild: memory-aligned PE + new .idata (single KERNEL32 descriptor, FT -&gt; 0x2F000)
13  verify: identical stdout and exit-code behaviour vs the original</code></pre>

            <h2>14. Reference</h2>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Item</th>
                            <th class="py-2 font-mono uppercase text-xs">Value</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 text-xs">
                        <tr class="border-b border-white/5"><td class="py-2">FNV-1a basis</td><td class="py-2 font-mono"><code>0x811C9DC5</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">SplitMix64 multipliers</td><td class="py-2 font-mono"><code>0xBF58476D1CE4E5B9</code> , <code>0x94D049BB133111EB</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">Container entry point</td><td class="py-2 font-mono"><code>RVA 0x3D000</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">Manifest</td><td class="py-2 font-mono">file <code>0x21CE00</code> &middot; magic <code>0x81A2D3C4</code> &middot; 6 blocks</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">Embedded original PE</td><td class="py-2 font-mono">file <code>0x21D0D0</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">Original OEP</td><td class="py-2 font-mono"><code>RVA 0xC8FC</code> &middot; VA <code>0x14000C8FC</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">Original IAT</td><td class="py-2 font-mono"><code>RVA 0x2F000</code> &middot; size <code>0x2C0</code> &middot; 87 imports</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">Rebuilt md5</td><td class="py-2 font-mono"><code>244365bf1c844b57b1cca5fc876f226b</code></td></tr>
                        <tr class="border-b border-white/5"><td class="py-2">Rebuilt sha256</td><td class="py-2 font-mono"><code>676ee93060420404fb663025d7cce7a0180c8dabafe93378bc2c0684f0af1dc9</code></td></tr>
                    </tbody>
                </table>
            </div>

            <h2>15. Closing Note</h2>
            <p>This container is a good piece of engineering because it targets process, not just tooling. Scrubbing the directories forces the analyst to accept that the Windows loader is not involved. Hashing the imports removes the string sweep that usually maps a binary in thirty seconds. Routing every call through a register table removes the static call graph. Refusing to decrypt under an attached debugger removes the single most common workflow. And re-sealing the code pages after decryption means that even a successful run only ever exposes the fraction of the program that happened to execute &mdash; the interesting half stays encrypted behind a guard page while the analyst congratulates themselves on a dump.</p>
            <p>The way through was to stop treating the packer as an obstacle and start treating it as a service. It knows how to decrypt its own pages; it just wants a fault at the right address. Give it 74 of them from a thread that only reads, and it will hand over the entire image without a single byte of its cipher ever being reversed. The rest &mdash; the pristine <code>.data</code> snapshot, the forwarder-aware IAT reconstruction, the memory-aligned rebuild &mdash; is careful bookkeeping.</p>

            <div class="mt-12 text-center">
                <p class="text-xl text-white font-bold mb-2">Original OEP: <code class="text-green-400">0x14000C8FC</code></p>
                <p class="text-xl text-white font-bold mb-2">Imports rebuilt: <code class="text-green-400">87 / KERNEL32.dll</code></p>
                <p class="text-xl text-white font-bold mb-2">Result: <code class="text-green-400">ALL OUTPUTS MATCH</code></p>
                <p class="text-text-muted italic">dr4gan &mdash; July 2026</p>
            </div>
        </div>
    `
});
