/**
 * Post: Mefedron CrackMe — Full Static Recovery of a 22-Character Flag
 * Category: Reverse Engineering
 */

window.Dr4ganData.posts.push({
    id: "mefedron-crackme",
    title: "Mefedron CrackMe — Full Static Recovery of a 22-Character Flag",
    date: "03/07/2026",
    category: "Reverse Engineering",
    tags: ["CrackMe", "PE64", "Windows", "VM", "ChaCha20", "XOR", "Binary Ninja", "Anti-Debug", "Shellcode"],
    description: "A deep static analysis of the Mefedron CrackMe: double-XOR encrypted .text section, massive junk shellcode injection, custom VM with 35+ opcodes, ChaCha20 red herring, RDTSC-dependent obfuscation, and algebraic seed cancellation — all defeated purely through static analysis.",
    image: null,
    content: `
        <div class="space-y-8">
            <!-- Metadata Block -->
            <div class="bg-white/[0.03] p-4 md:p-6 rounded-xl border border-white/5 font-mono text-xs sm:text-sm space-y-3">
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Target</span>
                    <span class="text-white break-words">Mefedron CrackMe</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Platform</span>
                    <span class="text-white break-words">PE64 / x86-64 / Windows</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Size</span>
                    <span class="text-white break-words">~2.8 MB</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Protection</span>
                    <span class="text-white break-words">Multi-layered (8 techniques)</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Tooling</span>
                    <span class="text-white break-words">Binary Ninja 5.2 (HLIL / MLIL / LLIL + SSA), Python 3</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 pt-1">
                    <span class="text-text-muted">Result</span>
                    <span class="text-green-400 font-bold tracking-wider break-words">FLAG_RECOVERED (22 chars, purely static)</span>
                </div>
            </div>

            <h2>1. Target Overview</h2>
            <p>The target is <code>mefedron.exe</code>, a PE64 Windows binary weighing approximately 2.8 MB. The objective is to recover a 22-character flag through purely static analysis — no debugger, no dynamic execution.</p>
            <p>The binary employs a layered defense-in-depth approach: a fully encrypted <code>.text</code> section, thousands of lines of junk shellcode per function, a ChaCha20 decoy cipher, a custom bytecode VM with 35+ opcodes, RDTSC-dependent runtime obfuscation, and anti-debug context corruption. Each layer is designed to frustrate a different class of analysis technique.</p>

            <h2>2. Stage 0 — .text Section Decryption</h2>
            <p>The binary ships with a fully encrypted <code>.text</code> section. Execution begins with a CRT stub that decrypts the section in-place before transferring control to the real entry point. Two XOR passes are applied sequentially:</p>

            <h3>2.1 Stage-1 XOR</h3>
            <div class="bg-white/[0.03] p-4 rounded-xl border border-white/5 font-mono text-xs sm:text-sm space-y-1">
                <p><strong class="text-white">Key1</strong> = <code>0xAE</code>, <strong class="text-white">Key2</strong> = <code>0xF5</code></p>
                <p><strong class="text-white">Counter</strong> initialized at <code>0x2B8E4E</code></p>
                <p>Each byte: <code>decrypted[i] = encrypted[i] ^ ((Key1 + counter) &amp; 0xFF)</code>, counter incremented, keys rotated</p>
            </div>

            <h3>2.2 Stage-2 XOR</h3>
            <div class="bg-white/[0.03] p-4 rounded-xl border border-white/5 font-mono text-xs sm:text-sm space-y-1">
                <p><strong class="text-white">Key1</strong> = <code>0x70</code>, <strong class="text-white">Key2</strong> = <code>0x80</code></p>
                <p>Applied over the output of Stage-1</p>
            </div>

            <p>A Python script was written to perform both passes offline, producing <code>mefedron_decrypted.exe</code> — a fully analyzable PE with the <code>.text</code> section in cleartext. All subsequent analysis operates on this decrypted image.</p>
            <pre><code class="language-python"># Core decryption loop (simplified)
for i in range(text_size):
    b = data[text_offset + i]
    b ^= (key1 + counter) &amp; 0xFF
    counter += 1
    key1, key2 = key2, key1
    data[text_offset + i] = b</code></pre>

            <h2>3. CRT Chain and Main Function Identification</h2>
            <p>Standard MSVC CRT chain:</p>
            <pre><code class="language-text">_start
  └─ wWinMainCRTStartup      @ 0x1402b6354
       └─ __scrt_common_main_seh  @ 0x1402b61d8
            └─ sub_140001000       (main)</code></pre>
            <p><code>sub_140001000</code> is enormous — over 70KB of decompiled output. The function body is a 10-case <code>switch</code> statement where every case is injected with thousands of lines of junk shellcode, all guarded by the always-false predicate <code>if (&amp;__return_addr == 0)</code>. This predicate is a compile-time constant that never evaluates to true, so every junk block is dead code. The decompiler faithfully reproduces it, making the function visually overwhelming but logically sparse.</p>

            <h2>4. The ChaCha20 Red Herring</h2>
            <p>Cases 3 through 6 of the main switch implement a textbook ChaCha20 cipher operating on a bytecode buffer:</p>
            <ul>
                <li><strong>Case 3</strong>: Initializes ChaCha20 state (key, nonce, counter)</li>
                <li><strong>Case 4</strong>: Generates the keystream block</li>
                <li><strong>Case 5</strong>: XORs the bytecode with the keystream (encryption)</li>
                <li><strong>Case 6</strong>: XORs the bytecode with the same keystream (decryption)</li>
            </ul>
            <p>Because ChaCha20 is a stream cipher and XOR is self-inverse, applying encrypt then decrypt yields the original plaintext with <strong>zero net modification</strong>. The entire ChaCha20 subsystem is a deliberate trap — it consumes analysis time and creates false leads but contributes nothing to the actual verification logic.</p>
            <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm">
                <p class="text-yellow-400 font-bold mb-1"><i class="ph ph-warning"></i> Honeypot Verdict</p>
                <p class="text-gray-300">Decompiling cases 3–6 and tracing the XOR operations confirms that the same keystream is applied twice. The bytecode buffer contents are identical before case 3 and after case 6. This is a pure time-waster.</p>
            </div>

            <h2>5. VM Architecture</h2>

            <h3>5.1 Context Structure</h3>
            <p>The VM operates on a monolithic context buffer of <code>0x33D8</code> bytes, allocated on the stack of main. Key offsets:</p>
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Offset</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Size</th>
                            <th class="py-2 font-mono uppercase text-xs">Purpose</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300">
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x0000</td><td class="py-2">—</td><td class="py-2">Internal state / scratch</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x2320</td><td class="py-2">var</td><td class="py-2">Bytecode buffer</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x2338</td><td class="py-2">22B</td><td class="py-2">User input (flag candidate)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x2350</td><td class="py-2">8B</td><td class="py-2">Instruction pointer</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x2360</td><td class="py-2">1B</td><td class="py-2">Last check result (0=fail, 1=pass)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x2658</td><td class="py-2">8B</td><td class="py-2">Seed (hardcoded: <code>0x1337DEADBEEFCAFE</code>)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x2670</td><td class="py-2">32B</td><td class="py-2">Hash1 (RDTSC-derived)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x2690</td><td class="py-2">32B</td><td class="py-2">Hash2 (RDTSC-derived)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x26B0</td><td class="py-2">32B</td><td class="py-2">Hash3 (RDTSC-derived)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x26D9</td><td class="py-2">110B</td><td class="py-2">Expected arrays (5 layers × 22 bytes)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x2747</td><td class="py-2">110B</td><td class="py-2">Key arrays (5 layers × 22 bytes)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x27B5</td><td class="py-2">22B</td><td class="py-2">Layer 0 expected copy</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x27CB</td><td class="py-2">22B</td><td class="py-2">Layer 0 key copy</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x2838</td><td class="py-2">var</td><td class="py-2">Opcode dispatch table (35+ entries)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x3380</td><td class="py-2">1B</td><td class="py-2">Mode flag</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">+0x33D0</td><td class="py-2">8B</td><td class="py-2">PRNG seed (RDTSC-dependent)</td></tr>
                    </tbody>
                </table>
            </div>

            <h3>5.2 Dispatch Table</h3>
            <p><code>sub_14029c4e0</code> populates the dispatch table at <code>ctx+0x2838</code>. Each entry maps an opcode byte to a handler function pointer. The critical opcodes:</p>
            <div class="bg-[#0a0a0a] p-4 rounded-lg border border-white/5 font-mono text-sm space-y-2">
                <p><strong class="text-white">Opcode 0x1D</strong> → <code>sub_14029dd50</code> — <span class="text-blue-400">Primary per-character verification</span></p>
                <p><strong class="text-white">Opcode 0x15</strong> → <code>sub_14029e550</code> — <span class="text-blue-400">Conditional skip (branch on check result)</span></p>
                <p><strong class="text-white">Opcode 0x2F</strong> → <code>sub_14029ef10</code> — <span class="text-blue-400">Secondary verification (fallback path)</span></p>
            </div>

            <h3>5.3 Bytecode Generation</h3>
            <p><code>sub_1402a9f90</code> generates the bytecode sequence. For each character index <code>i</code> (0–21), it emits:</p>
            <pre><code class="language-text">0x1D  i  i  (i%5)      — primary check: char i, layer i, method i%5
0x15  1  0xF1           — if result==1, skip 0xF1 bytes (jump past secondary)
0x2F  i  i              — secondary check: char i, layer i
0x15  1  0xF1           — if result==1, skip to next char
0x01  0x02  0x01  0x04  0x00  0x02  — failure handling</code></pre>
            <p>The method selector <code>i % 5</code> distributes the 22 characters across five verification methods.</p>

            <h2>6. Context Initialization and the RDTSC Problem</h2>

            <h3>6.1 Seed and Anti-Debug</h3>
            <p><code>sub_140296a10</code> initializes the VM context. The seed at <code>ctx+0x2658</code> is hardcoded to <code>0x1337DEADBEEFCAFE</code>. An anti-debug mechanism XORs certain context fields with the result of an <code>IsDebuggerPresent</code> check — if a debugger is attached, the context is silently corrupted, producing wrong verification results without any visible error.</p>
            <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm">
                <p class="text-red-400 font-bold mb-1"><i class="ph ph-shield-warning"></i> Anti-Debug: Silent Corruption</p>
                <p class="text-gray-300">The binary doesn't crash or display an error under a debugger — it simply produces incorrect verification results, leading the analyst to believe their recovered flag is wrong.</p>
            </div>

            <h3>6.2 RDTSC-Dependent Hash Chain</h3>
            <p>Three 32-byte hash arrays at <code>ctx+0x2670</code>, <code>ctx+0x2690</code>, and <code>ctx+0x26B0</code> are derived from a chain that incorporates <code>RDTSC</code> (Read Time-Stamp Counter) values. This means the hash contents <strong>vary between executions</strong>. These hashes are used as parameters to a post-processing transform applied to the expected/key arrays.</p>
            <p>This is the central challenge of the binary: <strong>if the verification parameters change every run, how can a static analysis recover the flag?</strong></p>

            <h2>7. Expected/Key Array Generation</h2>

            <h3>7.1 The Two Hardcoded Arrays</h3>
            <p><code>sub_140299110</code> generates the expected and key arrays for all five layers. At its core are two hardcoded 22-byte arrays:</p>
            <pre><code class="language-text">Array1: 47 F2 EE 98 49 FB 6B 4F 4F 7A 6A 8A 49 84 00 68 6C AD A1 8C AE B8
Array2: 24 A7 A8 BB 17 8C 1E 7C 39 1F 09 C3 0D A2 45 5F 4D C1 CE BD CB D4</code></pre>

            <h3>7.2 Seed Byte Extraction — The Critical Cancellation</h3>
            <p>For each byte index <code>i</code>, the generation code extracts a seed byte using <code>(seed &gt;&gt; ((i % 8) * 8)) &amp; 0xFF</code> for one array and <code>(seed &gt;&gt; (((i + 8) % 8) * 8)) &amp; 0xFF</code> for the other.</p>
            <p>Since <code>(i + 8) % 8 == i % 8</code> for all integer <code>i</code>, both expressions extract the <strong>exact same byte</strong> from the seed. When expected and key are XORed together (as in Method 0 verification), the seed contributions cancel:</p>
            <pre><code class="language-c">expected[i] ^ key[i] = (array1[i] ^ seed_byte) ^ (array2[i] ^ seed_byte)
                      = array1[i] ^ array2[i]</code></pre>
            <div class="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-sm">
                <p class="text-green-400 font-bold mb-1"><i class="ph ph-lightbulb"></i> Key Insight</p>
                <p class="text-gray-300">The identity <code>(i + 8) % 8 == i % 8</code> is not a bug — it is a deliberate design choice that makes the seed <em>appear</em> to contribute to the expected/key values but <strong>cancels completely</strong> when the values are combined during verification.</p>
            </div>

            <h3>7.3 Base XOR Vector</h3>
            <p>This yields a deterministic 22-byte vector — the <strong>base XOR</strong> — independent of the seed value:</p>
            <pre><code class="language-text">var_e8[i] = Array1[i] ^ Array2[i]

63 55 46 23 5E 77 75 33 76 65 63 49 44 26 45 37 21 6C 6F 31 65 6C
 c  U  F  #  ^  w  u  3  v  e  c  I  D  &amp;  E  7  !  l  o  1  e  l</code></pre>

            <h3>7.4 Five-Layer PRNG Expansion</h3>
            <p>Each of the five layers uses a different PRNG seed (base seed XORed with a layer-specific constant). The PRNG generates individual expected and key byte values, but the algebraic relationship between them is fixed by the verification method:</p>
            <div class="bg-[#0a0a0a] p-4 rounded-lg border border-white/5 font-mono text-sm space-y-2">
                <p><strong class="text-white">Method 0</strong> (XOR): <code>expected[i] = var_e8[i] ^ key[i]</code> → flag = <code>expected ^ key = var_e8</code></p>
                <p><strong class="text-white">Method 2</strong> (ROL): <code>expected[i] = ROL(ROL(var_e8[i], 3) + key[i], 5)</code> → flag = <code>var_e8[i]</code></p>
                <p><strong class="text-white">Method 3</strong> (HMAC): <code>expected[i] = HMAC(var_e8[i])</code> → flag = <code>var_e8[i]</code></p>
                <p><strong class="text-white">Methods 1, 4</strong>: Always-pass (no constraint imposed by opcode <code>0x1D</code>)</p>
            </div>
            <p>In every case, the flag character that satisfies the verification equation is <code>var_e8[i]</code>, by algebraic construction.</p>

            <h3>7.5 Post-Processing Transform</h3>
            <p>After generation, all five layers of expected and key arrays pass through <code>sub_1400ee750</code> — a three-loop transform using the RDTSC-dependent hashes:</p>
            <pre><code class="language-c">// Forward transform (sub_1400ee750)
Loop 1:  buf[i] ^= hash1[i % 32]
Loop 2:  buf[i] = ROL(buf[i], 3); buf[i] ^= hash2[i % 32]
Loop 3:  buf[i] = (buf[i] + hash3[i % 32]) &amp; 0xFF; buf[i] ^= hash3[(i + 16) % 32]</code></pre>
            <p>After this, the arrays as stored in the context are scrambled with RDTSC-dependent data. A naive attempt to read them from a memory dump would yield different values on every execution.</p>
            <p>The function <code>sub_1400bbab0</code> is also called on the arrays but was confirmed to be a thin wrapper around <code>VirtualLock</code> — it pins pages in physical memory but performs <strong>zero data modification</strong>.</p>

            <h2>8. The Inverse Transform — Killing the RDTSC Dependency</h2>

            <h3>8.1 Discovery</h3>
            <p>Decompiling the opcode <code>0x1D</code> handler (<code>sub_14029dd50</code>) revealed the key insight. The handler does <strong>not</strong> compare the flag against the post-processed (RDTSC-scrambled) arrays directly. Instead:</p>
            <pre><code class="language-c">// 1. Copy post-processed arrays to local buffers
memcpy(&amp;local_expected, get_layer_ptr(ctx->expected, layer), 22);
memcpy(&amp;local_key, get_layer_ptr(ctx->key, layer), 22);

// 2. Apply INVERSE transform to recover original values
inverse_transform(&amp;local_expected, 22, ctx->hash1, ctx->hash2, ctx->hash3);
inverse_transform(&amp;local_key, 22, ctx->hash1, ctx->hash2, ctx->hash3);

// 3. Verify against the ORIGINAL (pre-transform) values
switch (method) {
    case 0: result = (flag[i] == (local_expected[i] ^ local_key[i])); break;
    case 2: result = (ROL(ROL(flag[i],3) + local_key[i], 5) == local_expected[i]); break;
    case 3: result = hmac_verify(flag[i], local_expected[i]); break;
    case 1: result = 1; break;  // always pass
    case 4: result = 1; break;  // always pass
}</code></pre>

            <h3>8.2 Verification of the Inverse</h3>
            <p>Decompilation of <code>sub_1400fde80</code> (the inverse of <code>sub_1400ee750</code>) reveals three loops executed in <strong>reverse order</strong> with <strong>inverse operations</strong>:</p>

            <p><strong>Loop 1</strong> (undoes forward Loop 3):</p>
            <pre><code class="language-c">// Confirmed at 0x140101ED3 and 0x140101F2D
buf[i] ^= hash3[(i + 16) % 32]     // undo XOR
buf[i] = (buf[i] - hash3[i % 32])  // undo ADD → SUB</code></pre>

            <p><strong>Loop 2</strong> (undoes forward Loop 2):</p>
            <pre><code class="language-c">// Confirmed at 0x140105F55 and 0x140105F9E
buf[i] ^= hash2[i % 32]            // undo XOR
buf[i] = ROR(buf[i], 3)            // undo ROL(3) → ROR(3)
// ROR implementation: (val >> 3) | (val << 5)</code></pre>

            <p><strong>Loop 3</strong> (undoes forward Loop 1):</p>
            <pre><code class="language-c">buf[i] ^= hash1[i % 32]            // XOR is self-inverse</code></pre>

            <p>The operations are applied in reverse order, and each operation is the algebraic inverse of its forward counterpart:</p>
            <ul>
                <li>XOR → XOR (self-inverse)</li>
                <li>ADD → SUB</li>
                <li>ROL(3) → ROR(3) = <code>(val &gt;&gt; 3) | (val &lt;&lt; 5)</code></li>
            </ul>
            <p>This means: <code>inverse(forward(x)) = x</code> for any input <code>x</code>, regardless of the hash values.</p>

            <h3>8.3 Implication</h3>
            <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm">
                <p class="text-blue-400 font-bold mb-1"><i class="ph ph-key"></i> Critical Conclusion</p>
                <p class="text-gray-300">The RDTSC-dependent hashes are a <strong>symmetric obfuscation layer</strong> — they scramble the stored arrays and unscramble them at verification time. The actual comparison operates on the <strong>original, deterministic</strong> values. The entire RDTSC mechanism is a sophisticated anti-dump / anti-static-analysis measure that has <strong>zero effect</strong> on the logical verification.</p>
            </div>

            <h2>9. Verification Methods — Per-Character Analysis</h2>
            <p>The method selector <code>i % 5</code> assigns each character position to one of five verification strategies:</p>

            <h3>9.1 Method 0 — Direct XOR (positions 0, 5, 10, 15, 20)</h3>
            <pre><code class="language-c">if (flag[i] != (expected_orig[i] ^ key_orig[i]))
    fail();</code></pre>
            <p>Since <code>expected_orig[i] ^ key_orig[i] = var_e8[i]</code> by construction, the flag character must equal <code>var_e8[i]</code>.</p>

            <h3>9.2 Method 1 — Always Pass (positions 1, 6, 11, 16, 21)</h3>
            <p>The handler unconditionally sets <code>result = 1</code>. No constraint is imposed on the flag character by opcode <code>0x1D</code>. However, the expected value at these positions is still <code>var_e8[i]</code> by the generation construction, and the binary accepts this value.</p>

            <h3>9.3 Method 2 — ROL/ADD Chain (positions 2, 7, 12, 17)</h3>
            <pre><code class="language-c">uint8_t a = ROL(flag[i], 3);
uint8_t b = (a + key_orig[i]) &amp; 0xFF;
uint8_t c = ROL(b, 5);
if (c != expected_orig[i])
    fail();</code></pre>
            <p>The expected value was constructed as <code>ROL(ROL(var_e8[i], 3) + key_orig[i], 5)</code>, so <code>flag[i] = var_e8[i]</code> satisfies the equation by algebraic identity.</p>

            <h3>9.4 Method 3 — HMAC-Based Hash (positions 3, 8, 13, 18)</h3>
            <p>Uses an HMAC construction with the master key string <code>"HASH_METHOD_MASTER_KEY"</code> and a 3-round transform. The expected value is the hash of <code>var_e8[i]</code>, so <code>flag[i] = var_e8[i]</code> produces a matching hash.</p>

            <h3>9.5 Method 4 — Always Pass (positions 4, 9, 14, 19)</h3>
            <p>Identical behavior to Method 1. No constraint from opcode <code>0x1D</code>.</p>

            <h3>9.6 Summary</h3>
            <p>All five methods accept <code>flag[i] = var_e8[i]</code> as the correct value. Methods 0, 2, and 3 enforce this cryptographically; Methods 1 and 4 pass unconditionally (the expected value is still <code>var_e8[i]</code> by design).</p>

            <h2>10. Flag Recovery</h2>
            <p>Computing <code>Array1[i] ^ Array2[i]</code> for all 22 positions:</p>

            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Pos</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Array1</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Array2</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">XOR</th>
                            <th class="py-2 font-mono uppercase text-xs">ASCII</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 font-mono text-xs">
                        <tr class="border-b border-white/5"><td class="py-1">0</td><td class="py-1">0x47</td><td class="py-1">0x24</td><td class="py-1">0x63</td><td class="py-1 text-green-400">'c'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">1</td><td class="py-1">0xF2</td><td class="py-1">0xA7</td><td class="py-1">0x55</td><td class="py-1 text-green-400">'U'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">2</td><td class="py-1">0xEE</td><td class="py-1">0xA8</td><td class="py-1">0x46</td><td class="py-1 text-green-400">'F'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">3</td><td class="py-1">0x98</td><td class="py-1">0xBB</td><td class="py-1">0x23</td><td class="py-1 text-green-400">'#'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">4</td><td class="py-1">0x49</td><td class="py-1">0x17</td><td class="py-1">0x5E</td><td class="py-1 text-green-400">'^'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">5</td><td class="py-1">0xFB</td><td class="py-1">0x8C</td><td class="py-1">0x77</td><td class="py-1 text-green-400">'w'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">6</td><td class="py-1">0x6B</td><td class="py-1">0x1E</td><td class="py-1">0x75</td><td class="py-1 text-green-400">'u'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">7</td><td class="py-1">0x4F</td><td class="py-1">0x7C</td><td class="py-1">0x33</td><td class="py-1 text-green-400">'3'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">8</td><td class="py-1">0x4F</td><td class="py-1">0x39</td><td class="py-1">0x76</td><td class="py-1 text-green-400">'v'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">9</td><td class="py-1">0x7A</td><td class="py-1">0x1F</td><td class="py-1">0x65</td><td class="py-1 text-green-400">'e'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">10</td><td class="py-1">0x6A</td><td class="py-1">0x09</td><td class="py-1">0x63</td><td class="py-1 text-green-400">'c'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">11</td><td class="py-1">0x8A</td><td class="py-1">0xC3</td><td class="py-1">0x49</td><td class="py-1 text-green-400">'I'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">12</td><td class="py-1">0x49</td><td class="py-1">0x0D</td><td class="py-1">0x44</td><td class="py-1 text-green-400">'D'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">13</td><td class="py-1">0x84</td><td class="py-1">0xA2</td><td class="py-1">0x26</td><td class="py-1 text-green-400">'&amp;'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">14</td><td class="py-1">0x00</td><td class="py-1">0x45</td><td class="py-1">0x45</td><td class="py-1 text-green-400">'E'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">15</td><td class="py-1">0x68</td><td class="py-1">0x5F</td><td class="py-1">0x37</td><td class="py-1 text-green-400">'7'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">16</td><td class="py-1">0x6C</td><td class="py-1">0x4D</td><td class="py-1">0x21</td><td class="py-1 text-green-400">'!'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">17</td><td class="py-1">0xAD</td><td class="py-1">0xC1</td><td class="py-1">0x6C</td><td class="py-1 text-green-400">'l'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">18</td><td class="py-1">0xA1</td><td class="py-1">0xCE</td><td class="py-1">0x6F</td><td class="py-1 text-green-400">'o'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">19</td><td class="py-1">0x8C</td><td class="py-1">0xBD</td><td class="py-1">0x31</td><td class="py-1 text-green-400">'1'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">20</td><td class="py-1">0xAE</td><td class="py-1">0xCB</td><td class="py-1">0x65</td><td class="py-1 text-green-400">'e'</td></tr>
                        <tr class="border-b border-white/5"><td class="py-1">21</td><td class="py-1">0xB8</td><td class="py-1">0xD4</td><td class="py-1">0x6C</td><td class="py-1 text-green-400">'l'</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-white/5 rounded-xl border border-white/5 my-6 w-full overflow-x-auto">
                <div class="text-sm sm:text-lg md:text-2xl lg:text-3xl font-mono font-bold text-green-400 tracking-tight sm:tracking-wide md:tracking-widest text-center mb-2 break-all whitespace-normal">cUF#^wu3vecID&amp;E7!lo1el</div>
                <p class="text-xs text-text-muted mt-2">22 printable ASCII characters — Flag = Array1 ⊕ Array2</p>
            </div>

            <h2>11. Anti-Analysis Techniques Summary</h2>

            <h3>11.1 Encrypted .text Section</h3>
            <p>Two-pass XOR encryption with rotating keys. Prevents static analysis of the raw binary without first decrypting the code section.</p>

            <h3>11.2 Massive Junk Shellcode Injection</h3>
            <p>Every function of interest contains thousands of lines of junk code — real x86-64 instructions (not garbage bytes) that implement identity operations, dead computations, and unreachable logic. All guarded by <code>if (&amp;__return_addr == 0)</code>, which is always false. The decompiler faithfully lifts these, burying the real logic in <strong>10–50× noise</strong>. Manual triage of each function is required to separate signal from noise.</p>

            <h3>11.3 ChaCha20 Decoy</h3>
            <p>A fully functional ChaCha20 implementation that encrypts and then decrypts the bytecode buffer with the same keystream, producing zero net effect. Designed to consume analyst time and create false leads about "encrypted bytecode."</p>

            <h3>11.4 RDTSC-Dependent Obfuscation</h3>
            <p>Three 32-byte hash arrays derived from timestamp counter values. Applied as a forward transform to the expected/key arrays in storage, and reversed by an inverse transform at verification time. Makes memory dumps and static extraction of verification parameters appear non-deterministic, while the actual verification logic is fully deterministic.</p>

            <h3>11.5 Anti-Debug Context Corruption</h3>
            <p>The context initialization routine calls <code>IsDebuggerPresent</code> and uses the result to XOR critical context fields. Under a debugger, the context is silently corrupted — the binary doesn't crash or display an error, it simply produces incorrect verification results.</p>

            <h3>11.6 Custom VM with 35+ Opcodes</h3>
            <p>The verification logic is not implemented in native x86-64 code but in a custom bytecode VM. This adds an additional layer of indirection that requires reverse engineering the dispatch table, opcode semantics, and bytecode generation before the verification logic becomes accessible.</p>

            <h3>11.7 Five Verification Methods</h3>
            <p>Rather than a single comparison, the binary distributes characters across five different verification methods (direct XOR, always-pass, ROL/ADD chain, HMAC hash, always-pass). This prevents a single-point break — understanding one method does not immediately reveal the approach for others.</p>

            <h3>11.8 Algebraic Seed Cancellation</h3>
            <p>The seed byte extraction uses <code>i % 8</code> and <code>(i + 8) % 8</code>, which are mathematically identical. This is not a bug but a deliberate design choice: the seed appears to contribute to the expected/key values but cancels when the values are combined during verification. An analyst who doesn't notice this identity will waste time trying to determine the "correct" seed influence.</p>

            <h2>12. Key Functions Reference</h2>
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
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x140001000</td><td class="py-2">main</td><td class="py-2">Entry point, 10-case switch with junk</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x1402a9f90</td><td class="py-2">bytecode_gen</td><td class="py-2">Generates per-character VM bytecode</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x140296a10</td><td class="py-2">ctx_init</td><td class="py-2">VM context initialization, anti-debug</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x140299110</td><td class="py-2">expected_gen</td><td class="py-2">Expected/key array generation from hardcoded arrays</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14029c4e0</td><td class="py-2">dispatch_setup</td><td class="py-2">Populates opcode dispatch table</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14029dd50</td><td class="py-2">opcode_0x1d</td><td class="py-2">Primary verification handler (5 methods)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14029e550</td><td class="py-2">opcode_0x15</td><td class="py-2">Conditional skip (branch on result)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x14029ef10</td><td class="py-2">opcode_0x2f</td><td class="py-2">Secondary verification handler</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x1400ee750</td><td class="py-2">forward_transform</td><td class="py-2">3-loop post-processing (XOR, ROL+XOR, ADD+XOR)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x1400fde80</td><td class="py-2">inverse_transform</td><td class="py-2">Exact inverse of forward_transform</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x1400bbab0</td><td class="py-2">vlock_wrapper</td><td class="py-2">VirtualLock wrapper (no data modification)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x1402a1e30</td><td class="py-2">layer_selector</td><td class="py-2">Returns arg1 + arg2 * 0x16 (layer offset)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x140137480</td><td class="py-2">prng_init</td><td class="py-2">PRNG state initialization</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x140142a10</td><td class="py-2">prng_next</td><td class="py-2">PRNG next value generation</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x140175160</td><td class="py-2">hmac_kdf</td><td class="py-2">HMAC/KDF for Method 3 verification</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x140155f80</td><td class="py-2">sha256</td><td class="py-2">SHA-256 implementation (used by HMAC)</td></tr>
                        <tr class="border-b border-white/5"><td class="py-2 font-mono">0x1401372e0</td><td class="py-2">input_access</td><td class="py-2">Safe accessor for user input buffer</td></tr>
                    </tbody>
                </table>
            </div>

            <h2>13. Proof Chain</h2>
            <p>The flag recovery rests on the following independently verifiable chain of evidence:</p>
            <ol>
                <li><strong>Decryption correctness</strong>: Stage-1 and Stage-2 XOR keys and counters extracted from the CRT init stub. Decrypted binary passes PE validation and disassembles coherently.</li>
                <li><strong>ChaCha20 neutrality</strong>: Decompilation of cases 3–6 shows encrypt-then-decrypt with the same keystream. XOR self-inverse property guarantees zero net modification.</li>
                <li><strong>Junk code identification</strong>: All junk blocks guarded by <code>if (&amp;__return_addr == 0)</code>, a compile-time false constant. Confirmed via HLIL: no side effects escape the guarded blocks.</li>
                <li><strong>Hardcoded arrays</strong>: Extracted from <code>sub_140299110</code> via decompilation cross-referenced with hexdump. Values are compile-time constants embedded in the <code>.rdata</code> section.</li>
                <li><strong>Seed byte cancellation</strong>: <code>i % 8 == (i + 8) % 8</code> is a mathematical identity for all integers. Verified by enumerating all 22 positions.</li>
                <li><strong>Inverse transform correctness</strong>: <code>sub_1400fde80</code> decompilation shows three loops in reverse order with inverse operations (SUB for ADD, ROR for ROL, XOR for XOR). Confirmed at instruction level via LLIL cross-reference.</li>
                <li><strong>Handler flow</strong>: Opcode <code>0x1D</code> copies post-processed arrays, applies inverse transform, then compares against original values. The RDTSC-dependent transform is fully neutralized before any comparison occurs.</li>
                <li><strong>Method 0 algebra</strong>: <code>expected_orig ^ key_orig = (array1 ^ seed_byte ^ prng_byte) ^ (array2 ^ seed_byte ^ prng_byte')</code>. For Method 0, expected is constructed as <code>var_e8 ^ key</code>, so <code>expected ^ key = var_e8</code>.</li>
                <li><strong>Methods 2, 3 consistency</strong>: Verification equations for Methods 2 and 3 are constructed using <code>var_e8[i]</code> as the input. The equation is satisfied by definition when <code>flag[i] = var_e8[i]</code>.</li>
                <li><strong>Flag = Array1 ⊕ Array2</strong>: <code>cUF#^wu3vecID&amp;E7!lo1el</code> — 22 printable ASCII characters.</li>
            </ol>

            <div class="mt-12 text-center">
                <p class="text-xl text-white font-bold mb-2">Flag: <code class="text-green-400">cUF#^wu3vecID&amp;E7!lo1el</code></p>
                <p class="text-text-muted italic">dr4gan — March 2026</p>
            </div>
        </div>
    `
});
