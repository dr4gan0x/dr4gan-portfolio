/**
 * Post: Hydra Obfuscator (Modded) — UnpackMe Write-up
 * Category: Reverse Engineering
 */

window.Dr4ganData.posts.push({
    id: "hydra-obf-modded",
    title: "Hydra Obfuscator (Modded) — UnpackMe Write-up",
    date: "06/04/2026",
    category: "Reverse Engineering",
    tags: ["Obfuscation", ".NET", "Unpacking", "QuickLZ", "JIT Hooking", "Anti-Tamper", "Python"],
    description: "A deep static analysis and unpacking walkthrough of a target binary protected with a modded build of Hydra Obfuscator. Covers JIT hook analysis, QuickLZ resource decompression, dynamic verification key recovery, and bypassing SHA-256 and HMAC-fused integrity checks.",
    image: null,
    content: `
        <div class="space-y-8">
            <!-- Metadata Block -->
            <div class="bg-white/[0.03] p-4 md:p-6 rounded-xl border border-white/5 font-mono text-xs sm:text-sm space-y-3">
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 border-b border-white/5 pb-2">
                    <span class="text-text-muted shrink-0">Target</span>
                    <span class="text-white break-words sm:text-right">UnpackMe_protected.exe</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 border-b border-white/5 pb-2">
                    <span class="text-text-muted shrink-0">Platform</span>
                    <span class="text-white break-words sm:text-right">.NET Framework 4.8 / x86 (32-bit)</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 border-b border-white/5 pb-2">
                    <span class="text-text-muted shrink-0">Protector</span>
                    <span class="text-white break-words sm:text-right">Hydra Obfuscator (Modded Build)</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 border-b border-white/5 pb-2">
                    <span class="text-text-muted shrink-0">Tooling</span>
                    <span class="text-white break-words sm:text-right">Python (pefile, dnfile, capstone)</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 pt-1">
                    <span class="text-text-muted shrink-0">Key / Result</span>
                    <span class="text-green-400 font-bold tracking-wider break-words sm:text-right">sixsevenbruh (FULLY UNPACKED)</span>
                </div>
            </div>

            <h2>1. Triage</h2>
            <p>First pass is always the same — confirm the format, the architecture and where the managed metadata lives.</p>
            <pre><code class="language-python">import pefile, math
pe = pefile.PE("UnpackMe_protected.exe", fast_load=True)
pe.parse_data_directories()</code></pre>
            <pre><code class="language-text">Machine:        0x14c   (I386)
Magic:          0x10b   (PE32)
EntryPoint RVA: 0x2b360e
ImageBase:      0x400000
Sections:       3</code></pre>
            <p>So it is a 32-bit, PE32 binary with a classic managed entry stub (<code>mscoree.dll!_CorExeMain</code>). There are three sections with randomized names:</p>
            <pre><code class="language-text">????M4?    VA=0x2000   VS=0x2b1614 RAW=0x2b1800 entropy=7.776
?????M     VA=0x2b4000 VS=0x5a6    RAW=0x600    entropy=4.083
QL??G?     VA=0x2b6000 VS=0xc      RAW=0x200    entropy=0.102</code></pre>
            <p>The randomized section names are cosmetic, but the <strong>7.776 entropy</strong> on the text section indicates packed/encrypted data, which is abnormal for a standard IL image. The data directories show the layout:</p>
            <pre><code class="language-text">[ 1] IMPORT     RVA=0x2b35b8  Size=0x53     -> mscoree.dll!_CorExeMain
[ 2] RESOURCE   RVA=0x2b4000  Size=0x5a6
[14] CLR        RVA=0x2008    Size=0x48</code></pre>

            <h3>1.1 COR20 Header</h3>
            <pre><code class="language-text">RuntimeVersion:  2.5
Flags:           0x20003   (ILONLY | 32BITREQUIRED | 32BITPREFERRED)
EntryPointToken: 0x060000A5  (MethodDef RID 165)
MetaData:        RVA 0x2AB958  size 0x7CE0   (~32 KB)
Resources:       RVA 0x27294   size 0x284CC4 (~2.6 MB)</code></pre>
            <p>Notice the resources directory: <strong>~2.6 MB of managed resources in a 2.8 MB file</strong>. The payload sits in the resources, and the 32 KB of metadata acts as a shell. </p>

            <h3>1.2 Metadata Streams</h3>
            <pre><code class="language-text">#-          size 0x2054
#Strings    size 0x4b98
#US         size 0x60c
#GUID       size 0x30
#Blob       size 0xa4c</code></pre>
            <p>The presence of the <code>#-</code> stream instead of <code>#~</code>, along with a populated <code>MethodPtr</code> table (206 rows, matching <code>MethodDef</code>), is a deliberate anti-decompiler move. Method ordering is indirected through <code>MethodPtr</code>, which makes naive decompiler parsers read the wrong bodies. <code>dnfile</code> handles this, but token mappings must be resolved to align with what the runtime executes.</p>
            <p>Other metadata table sizes:</p>
            <pre><code class="language-text">TypeDef 138   MethodDef 206   MethodPtr 206
Field 48      FieldRva 5      ImplMap 21   ModuleRef 4
ManifestResource 6</code></pre>
            <p>Reading the <code>ImplMap</code> (P/Invoke imports) reveals the protector's footprint before looking at the IL:</p>
            <div class="bg-white/[0.03] p-4 rounded-xl border border-white/5 font-mono text-xs sm:text-sm space-y-1">
                GetProcAddress, LoadLibrary(A), VirtualProtect (x2), ZeroMemory, GetModuleHandle(A), WriteProcessMemory, NtQueryInformationProcess, NtClose, NtRemoveProcessDebug, NtSetInformationDebugObject, NtSetInformationThread (x2), CheckRemoteDebuggerPresent, OpenThread, CloseHandle
            </div>
            <p><code>VirtualProtect</code> and <code>WriteProcessMemory</code> point to dynamic JIT hooking. The <code>Nt*</code> set suggests anti-debugging, and <code>ZeroMemory</code> over PE headers serves as anti-dumping.</p>

            <h2>2. The Resource Layout</h2>
            <p>We extract six manifest resources from the directory (prefixed by a 4-byte length):</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Index</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Name</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Length</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Entropy</th>
                            <th class="py-2 font-mono uppercase text-xs">Type</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300">
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">[0]</td><td class="py-2">UnpackMe.Properties.Resources.resources</td><td class="py-2">180</td><td class="py-2">4.96</td><td class="py-2">WinForms Resources</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">[1]</td><td class="py-2">@whystarlixbs</td><td class="py-2">32</td><td class="py-2">5.00</td><td class="py-2">Key material</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">[2]</td><td class="py-2">Antidump_Hydra</td><td class="py-2">566,518</td><td class="py-2">7.39</td><td class="py-2">QuickLZ Compressed MZ</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">[3]</td><td class="py-2">@whystarlixbs_Nde1ZLfQ9m...</td><td class="py-2">54,406</td><td class="py-2">7.58</td><td class="py-2">QuickLZ Compressed MZ</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">[4]</td><td class="py-2">@whystarlixbs_K0TCslP8oh9...</td><td class="py-2">1,979,401</td><td class="py-2">7.75</td><td class="py-2">64-bit native PE JIT Helper (MZ at +9)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">[5]</td><td class="py-2">W8E3vp1dKujs1orPFTcLTNz...</td><td class="py-2">38,860</td><td class="py-2">7.36</td><td class="py-2">Compressed IL Table (No MZ)</td></tr>
                    </tbody>
                </table>
            </div>
            <p>Every large resource is packed starting with a one-byte tag (<code>0x4E</code>/<code>0x4F</code>) followed by two little-endian dwords. Unpacking resources <code>[2]</code> and <code>[3]</code> yields clean .NET/native assemblies. Resource <code>[5]</code> decompresses to the main IL store table.</p>

            <h2>3. Decoy Method Bodies</h2>
            <p>Scanning the method bodies in the assembly reveals that 105 out of 206 methods contain a byte-for-byte identical 17-byte body:</p>
            <pre><code class="language-text">00 00 00 00 00 00     nop x6
72 b9 05 00 70        ldstr  0x700005B9
73 b2 00 00 0a        newobj 0x0A0000B2
7a                    throw</code></pre>
            <p>Resolving the metadata tokens:</p>
            <pre><code class="language-text">US 0x5B9         -&gt; "obfuscated by https://t.me/whystarlixbs"
MemberRef 0xB2   -&gt; System.Exception::.ctor</code></pre>
            <p>All protected methods, including the entry point (RID 165), are dummy stubs throwing exceptions. The real IL is hot-patched during compilation via a custom JIT hook installed by the hidden module initializer.</p>
            <p>For fat method bodies (e.g. <code>DecompressBytes</code>, RID 134), the protector pads the front of the body with NOPs: <code>[N nop bytes][11-byte throw stub]</code>. Crucially, the fat headers (containing <code>maxstack</code>, <code>localVarSig</code>, and Exception Handling flags) remain intact, allowing a static reconstruction of the real methods.</p>

            <h2>4. Runtime Mapping</h2>
            <p>Grouping methods by their declaring type maps out the protector's structural runtime components:</p>
            <div class="bg-[#0a0a0a] p-4 rounded-lg border border-white/5 font-mono text-sm space-y-2 mb-6">
                <p><strong class="text-white">Anti-Dump:</strong> EraseHeader, EraseSection, PatchEtw, GetAddress</p>
                <p><strong class="text-white">QuickLZ Decompression:</strong> DecompressBytes, HeaderLen, SizeDecompressed</p>
                <p><strong class="text-white">Anti-Debug:</strong> DetachFromDebuggerProcess, CheckRemoteDebugger, CheckDebugPort, CloseHandleAntiDebug, ThreadMethod</p>
            </div>
            <p>The module constructor (<code>&lt;Module&gt;::.cctor</code>) redirects execution immediately to the hook initialization routines:</p>
            <pre><code class="language-text">call 0x060000C6   ; RID 198 (Hook Installer)
call 0x06000002   ; RID 2
ret</code></pre>

            <h3>4.1 Hook Installation Flow (RID 198)</h3>
            <p>This method is control-flow flattened using random number state seeds. It executes the following steps:</p>
            <ol class="list-decimal pl-6 space-y-2 mb-6">
                <li>Builds module strings (like <code>"ntdll.dll"</code>, <code>"kernel32.dll"</code>) dynamically using stack-allocated bytes (<code>localloc</code>) to avoid detection of static strings.</li>
                <li>Queries the environment version and locates internal runtime reflection pointers.</li>
                <li>Retrieves the encrypted IL table from resource <code>[5]</code> by base64 decoding the resource name:
                    <pre><code class="language-text">Convert.FromBase64String("VzhFM3ZwMWRLdWpzMW9yUEZUY0xUTnpTc1o4SHFRYUNrbFVD") 
-&gt; "W8E3vp1dKujs1orPFTcLTNzSsZ8HqQaCklUC"</code></pre>
                </li>
                <li>Decompresses the native hook engine from resources, writes it to <code>%TEMP%</code>, maps it via <code>LoadLibrary</code>, and redirects the CLR's <code>compileMethod</code> function to decrypt and supply the real IL dynamically.</li>
            </ol>

            <h2>5. QuickLZ Decompression</h2>
            <p>The method <code>DecompressBytes</code> implements standard QuickLZ level-1 decompression. We can implement it in Python for static analysis:</p>
            <pre><code class="language-python">def size_header(s):   return 9 if (s[0] &amp; 2) == 2 else 3
def size_decomp(s):   return (s[5]|s[6]&lt;&lt;8|s[7]&lt;&lt;16|s[8]&lt;&lt;24) if size_header(s)==9 else s[2]

def decompress(data):
    src  = bytes(data) + b"\x00"*33
    size = size_decomp(src); hdr = size_header(src)
    dst  = bytearray(size + 32)
    if (src[0] &amp; 1) != 1:
        dst[:size] = src[hdr:hdr+size]; return bytes(dst[:size])
    si, di, cword, nxt = hdr, 0, 1, 0
    ht, last_hashed, lvl = [0]*4096, -1, (src[0] &gt;&gt; 2) &amp; 3
    # ... level-1 match & literal decompression loop ...
    return bytes(dst[:size])</code></pre>

            <h2>6. Unpacking the IL Table</h2>
            <p>Once resource <code>[5]</code> (<code>W8E3...</code>) is decompressed, we get 190,867 bytes of raw records. The stream starts with the total method record count, followed by individual method definitions:</p>
            <pre><code class="language-text">a6 00 00 00 | 02 00 00 06 | 08 | 4b 41 4d 41 41 41 59 71</code></pre>
            <p>Parsing these records:
            <br>• <code>a6 00 00 00</code> = 166 records.
            <br>• <code>02 00 00 06</code> = Method token <code>0x06000002</code> (RID 2).
            <br>• <code>08</code> = Base64 data length.
            <br>• <code>4b 41 4d 41 41 41 59 71</code> = <code>"KAMAAAYq"</code>, which decodes to:
            </p>
            <pre><code class="language-text">28 03 00 00 06 2a  -&gt;  call 0x06000003 ; ret</code></pre>
            <p>Each record format follows: <code>[token: 4B][LEB128 Length][Base64 IL Data]</code>. We run a parsing script to extract all method payloads statically:</p>
            <pre><code class="language-python">count = u32(d, 0); p = 4; table = {}
for _ in range(count):
    tok = u32(d, p); p += 4
    ln, p = leb128(d, p)
    table[tok] = base64.b64decode(d[p:p+ln]); p += ln</code></pre>

            <h2>7. In-Place Rebuilding</h2>
            <p>Because the real method bodies are always shorter than or equal to the size of the decoy bodies (which have extra NOPs and exception throws), we can overwrite the bodies back into the PE file without modifying RVAs or section sizes:</p>
            <pre><code class="language-python">for tok, il in table.items():
    h = parse_header(off)                 # Extract original fat/tiny header
    eh = read_eh(off, h)                  # Extract exception handlers
    nb = tiny_or_fat(h, il, eh)           # Rebuild body with decompressed IL
    data[off:off+len(nb)] = nb
    zero_fill(off+len(nb), body_extent(off)) # Fill remaining space with NOPs/zeros</code></pre>
            <p>After running this, all 166 methods are unpacked statically on disk. However, executing this unpacked binary directly triggers the security protections.</p>

            <h2>8. Defeating Anti-Tamper</h2>
            <p>A naive execution of the unpacked binary triggers self-deletion. We analyze two core integrity checks:</p>
            
            <h3>8.1 SHA-256 Self-Delete (RID 139)</h3>
            <p>This routine hashes the file on disk and compares it to a hardcoded SHA-256 digest. If the digest mismatches, it runs a command to delete the file:</p>
            <pre><code class="language-text">cmd.exe /C ping 1.1.1.1 -n 1 -w 3000 &gt; Nul &amp; Del "&lt;self&gt;"</code></pre>

            <h3>8.2 HMAC-SHA256 Constant Pool (RID 197)</h3>
            <p>The constant pool is encrypted and checked using an HMAC-SHA256 hash. If we completely remove the module initializer to bypass protections, the pool initialization (RID 181) is skipped, causing string resolution functions to crash with <code>ArgumentException: Destination array was not long enough</code>.</p>
            <p>Conversely, if we keep the initializer, the JIT hook runs, checks headers, and throws <code>InvalidProgramException</code> on the modified headers.</p>
            <p><strong>The Bypass Strategy:</strong> We must keep the module initializer and the constant pool logic running, but patch the JIT hook installer and the integrity validator to return immediately:</p>
            <ul>
                <li><strong>RID 139 (Self-Delete Integrity Check)</strong> &rarr; Patch to return immediately (<code>ret</code> / <code>0x2A</code>).</li>
                <li><strong>RID 198 (JIT Hook Installer)</strong> &rarr; Patch to return immediately (<code>ret</code> / <code>0x2A</code>).</li>
            </ul>
            <p>This disables JIT hooking and self-deletion, while keeping the constant pool decryption intact. Running the binary now opens the login interface.</p>

            <h2>9. Reclaiming the Key</h2>
            <p>The Login handler resides at RID 162. Stripping the control flow flattening, it decodes the expected password using the constant pool string decoder and compares it with user input:</p>
            <pre><code class="language-csharp">if (textBox.Text == Decode(keyId)) { /* success */ } else { /* fail */ }</code></pre>
            <p>Instead of reversing the HMAC-fused constant pool decoder, we can leak the password dynamically. We patch the string comparison logic in RID 162 to set the form's window title (<code>Control.Text</code>) to the decrypted string:</p>
            <pre><code class="language-text">ldarg.0                          ; Load "this" Form pointer
call     0x0600006D              ; Call key ID helper (RID 109)
call     0x060000B4              ; Call String Decode (RID 180)
callvirt Control::set_Text       ; Set Form caption text to key
ldc.i4.1                         ; Return true for validation comparison
nop x9</code></pre>
            <p>Running the patched executable and hitting <strong>Login</strong> outputs the password string directly onto the window title bar:</p>
            
            <div class="flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-white/5 rounded-xl border border-white/5 my-6 w-full overflow-x-auto">
                <div class="text-sm sm:text-lg md:text-2xl lg:text-3xl font-mono font-bold text-green-400 tracking-tight sm:tracking-wide md:tracking-widest text-center mb-2 break-all whitespace-normal">sixsevenbruh</div>
                <p class="text-xs text-text-muted mt-2">Decrypted Verification Password</p>
            </div>

            <h2>10. Conclusion</h2>
            <p>The target implements multi-stage obfuscation, hiding compiled IL tables inside QuickLZ resources and resolving them dynamically using JIT hooks. By reversing the storage format of the IL table, we successfully extracted all method bodies and wrote them back to disk. Surgical patching of the self-defense checks allowed the unpacked binary to run safely and reveal the validation key: <code>sixsevenbruh</code>.</p>
        </div>
    `
});
