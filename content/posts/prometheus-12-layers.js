/**
 * Post: Prometheus (12 Layers of Insanity)
 * Category: Reverse Engineering
 */

window.Dr4ganData.posts.push({
    id: "prometheus-12-layers",
    title: "Prometheus (12 Layers of Insanity) — Full Technical Write-Up",
    date: "02/06/2026",
    category: "Reverse Engineering",
    tags: ["Rust", "CrackMe", "SipHash", "AES", "Math", "ELF64", "Linux"],
    description: "A deep dive into the 6/6 difficulty Prometheus CrackMe from tuts4you. Analyzing 12 layers of protection including anti-debug, custom VM-like dispatch, SipHash, and polynomial evaluation.",
    image: null,
    content: `
        <div class="space-y-8">
            <!-- Metadata Block -->
            <div class="bg-white/[0.03] p-4 md:p-6 rounded-xl border border-white/5 font-mono text-xs sm:text-sm space-y-3">
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Target</span>
                    <span class="text-white break-words">Prometheus — 12 Layers of Insanity</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Platform</span>
                    <span class="text-white break-words">ELF64 / AMD64 / Linux</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-b border-white/5 pb-2">
                    <span class="text-text-muted">Difficulty</span>
                    <div class="flex gap-1">
                        <span class="text-red-500">★</span><span class="text-red-500">★</span><span class="text-red-500">★</span><span class="text-red-500">★</span><span class="text-red-500">★</span><span class="text-red-500">★</span>
                    </div>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 pt-1">
                    <span class="text-text-muted">Result</span>
                    <span class="text-green-400 font-bold tracking-wider break-words">KEY_RECOVERED</span>
                </div>
            </div>

            <h2>1. Target Overview</h2>
            <p>Prometheus is a Linux x86_64 CrackMe published on the tuts4you forum under the title "12 Layers of Insanity." The challenge description states that the binary expects a 28-character key verified through 12 interconnected layers, and that "the binary knows its own shape." The difficulty rating is 6 out of 6 — the maximum tier.</p>
            <p class="mb-6">The distributed file is a single stripped ELF64 executable. No auxiliary files, configuration data, or external dependencies are shipped alongside it.</p>
            
            <a href="https://forum.tuts4you.com/files/file/2536-prometheus-12-layers-of-insanity/" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-sm text-blue-400 hover:text-blue-300 transition-all group">
                <i class="ph ph-download-simple group-hover:scale-110 transition-transform"></i>
                <span>Download from Tuts4You</span>
            </a>

            <h2>2. Environment and Toolchain</h2>
            <p>All static analysis was performed in Binary Ninja (latest build) with the ELF64 loader. Dynamic verification and solver execution ran on Kali Linux under WSL2 with the following toolchain:</p>
            <ul>
                <li><strong>rabin2 / radare2</strong> — initial triage (section headers, entry metadata)</li>
                <li><strong>Detect It Easy (DiE)</strong> — preliminary file identification</li>
                <li><strong>Binary Ninja</strong> — primary disassembler/decompiler (HLIL, MLIL, disassembly, xrefs, CFG)</li>
                <li><strong>gcc 13 (-O3 -march=native)</strong> — solver compilation</li>
                <li><strong>xxd / objdump</strong> — byte-level verification of embedded constants</li>
            </ul>
            <p>The binary was loaded at its default PIE base. All addresses referenced in this write-up correspond to the loaded image as presented by Binary Ninja.</p>

            <h2>3. Initial Reconnaissance</h2>

            <h3>3.1 DiE Misidentification</h3>
            <p>Detect It Easy reported the binary as:</p>
            <pre><code class="language-text">ELF64, Ubuntu Linux, GCC(3.X), C, GLIBC(2.34)</code></pre>
            <p>This turned out to be incorrect in one critical respect. The binary is not written in C. DiE was fooled by the static linking of the Rust standard library and the use of the system linker, which produced a binary surface that looks like a typical GCC/C artifact. The actual source language is <strong>Rust</strong>, identified through debug path strings embedded in the binary (detailed below).</p>

            <h3>3.2 Binary Metadata</h3>
            <pre><code class="language-text">Format:      ELF64 (PIE)
Architecture: AMD64 / x86_64
Endianness:   Little-endian
Linking:      Mostly static (Rust stdlib statically linked)
PLT imports:  Only 2 — __cxa_finalize, _Unwind_Resume
Segments:     Standard layout, no RWX anomalies, no packing signatures
Stripped:     Yes (no DWARF, no .symtab)</code></pre>
            <p>The segment layout is clean — <code>.text</code> is RX, <code>.data</code>/<code>.bss</code> are RW, <code>.rodata</code> is R. No segment has simultaneous write+execute permissions, which rules out trivial self-modifying code at the segment level. The absence of UPX signatures, entropy anomalies, or overlay data confirms the binary is not packed.</p>
            <p>Only two PLT stubs exist: <code>__cxa_finalize</code> (standard cleanup) and <code>_Unwind_Resume</code> (Rust panic/unwinding infrastructure). Everything else — including the entire Rust standard library, allocator, formatting machinery, and I/O stack — is statically linked into the binary.</p>

            <h3>3.3 String Analysis and Language Identification</h3>
            <p>A full string dump revealed the ground truth that DiE missed. Among the ~800 extracted strings, several contain Rust source file paths:</p>
            <pre><code class="language-text">src/main.rs
src/obfuscation/flatten.rs
src/protection/environment.rs
src/vm/dispatcher.rs
src/crypto/sbox.rs
src/crypto/secure_verify.rs</code></pre>
            <p>These are panic/debug location strings that the Rust compiler embeds for unwinding and error reporting, even in release builds. They expose the original project structure and confirm:</p>
            <ol>
                <li>The language is <strong>Rust</strong>, not C.</li>
                <li>The project has a deliberate modular architecture: obfuscation, protection, VM dispatch, cryptographic primitives, and secure verification are separate modules.</li>
                <li>The presence of <code>flatten.rs</code> suggests control-flow flattening was applied — a deliberate obfuscation technique.</li>
                <li><code>environment.rs</code> signals anti-analysis/environment detection logic.</li>
                <li><code>dispatcher.rs</code> indicates a VM-style or state-machine-style dispatch architecture for the verification layers.</li>
            </ol>
            <p>Additional strings of interest:</p>
            <pre><code class="language-text">"Enter key: "                     — user prompt
"Access Granted!"                 — success path
"Access Denied!"                  — failure path
"thread 'main' panicked at"      — Rust panic boilerplate</code></pre>
            <p>No network-related strings (no URLs, hostnames, or socket references). No filesystem operation strings beyond stdin/stdout. The binary is self-contained.</p>

            <p><strong>Anti-analysis artifact strings:</strong></p>
            <p>A separate string category exposes the anti-analysis infrastructure from <code>src/protection/environment.rs</code>:</p>
            <pre><code class="language-text">// Debugger / tracer detection
"TracerPid"                     — /proc/self/status attached-debugger check
"ptrace"                        — ptrace self-attach detection
"ida", "ida64"                  — IDA Pro process name detection
"x64dbg", "ollydbg"            — x86 debugger detection
"radare2", "r2"                 — radare2 detection

// VM / sandbox detection (MAC address prefix matching)
"00:0c:29", "00:50:56"         — VMware MAC prefixes
"08:00:27"                      — VirtualBox MAC prefix

// Dynamic instrumentation detection
"frida", "xposed", "substrate" — Frida / Xposed / Cydia Substrate

// Environment variable tampering
"LD_PRELOAD", "LD_DEBUG"       — library injection / debug output detection</code></pre>
            <p>These strings are referenced exclusively by the anti-analysis gate (Layers 1–3). They do not participate in the key verification logic.</p>

            <h3>3.4 Function Landscape</h3>
            <p>Binary Ninja identified approximately 1,600 functions. The vast majority are Rust standard library internals: formatting (<code>core::fmt::*</code>), panicking (<code>core::panicking::*</code>), allocation (<code>alloc::*</code>), and string handling. The actual CrackMe logic concentrates in roughly 20-30 functions in the <code>0x418000–0x43A000</code> range.</p>

            <h2>4. Entry Point and Program Flow</h2>

            <h3>4.1 ELF Entry → Rust Bootstrap</h3>
            <p>The ELF entry point is the standard <code>_start</code> stub which calls <code>__libc_start_main</code> with <code>main</code> at <code>0x41bea0</code>. Decompilation of <code>main</code> reveals it is not the real entry — it is the Rust <code>lang_start</code> trampoline:</p>
            <pre><code class="language-c">// 0x41bea0 — main (Rust lang_start wrapper)
fn main(argc, argv, envp) {
    std::rt::lang_start(sub_41a0c0, argc, argv, envp);
}</code></pre>
            <p>This is standard Rust. The actual program logic lives in <code>sub_41a0c0</code>, which <code>lang_start</code> invokes after initializing the Rust runtime (setting up the global allocator, panic hooks, and thread-local storage).</p>

            <h3>4.2 Real Entry — sub_41a0c0</h3>
            <p>Decompilation of <code>sub_41a0c0</code>:</p>
            <pre><code class="language-text">0x41a0c0:
  1. Print "Enter key: " to stdout (via Rust fmt machinery)
  2. Read a line from stdin into a heap-allocated String
  3. Trim trailing whitespace (newline, carriage return)
  4. Call sub_418a10(key_ptr, key_len)
  5. If sub_418a10 returns 1 → print "Access Granted!" + prize banner
  6. Otherwise → print "Access Denied!"</code></pre>
            <p>The key is passed as a <code>(ptr, len)</code> pair — standard Rust string slice representation. No null terminator; length is tracked explicitly. This matters for the hash computations later.</p>

            <h3>4.3 Verification Orchestrator — sub_418a10</h3>
            <p>This is the heart of the CrackMe. Decompilation of <code>sub_418a10</code> reveals a multi-stage verification pipeline with a <strong>three-gate architecture</strong> — each gate must pass for the key to be accepted.</p>
            <p><strong>Binary Ninja decompiler output — annotated call sequence:</strong></p>
            <pre><code class="language-c">// sub_418a10 — Verification orchestrator (annotated decompiler output)

// ─── Anti-analysis initialization (Layers 1–2: RDTSC) ───
00418a5a    sub_42d510(&amp;var_c41c8)                      // RDTSC baseline + 128-byte context alloc
00418a62    sub_42d340(&amp;var_c41c8)                      // Second RDTSC delta measurement
00418abb    _rdtsc()                                      // Inline RDTSC for seed mixing
00418ad1    var_c4208 = -0x2152411035014542               // = 0xDEADBEEFCAFEBABE (seed constant)

// ─── Gate 1: Sequential hard checks (early-exit on failure) ───
00418b6f    if (sub_42f560() == 0) goto fail               // Layer 3: clock_gettime timing gate
00418b7f    if (sub_419ef0(arg2) == 0) goto fail           // Layer 4: key_len == 28
00418bb4    if (sub_433250(&amp;var, arg1, arg2) == 0)       // Layers 5–11: master validation chain
                goto fail

// ─── S-box / lookup table initialization ───
00418bde    memcpy(&amp;var_c4040, sbox_data, 0x380)         // 896-byte S-box table (NOT 256!)
00419324    rax_17 = malloc(0x700)                         // 1792-byte processed lookup table

// ─── Gate 2: VM-dispatched redundant validation ───
00419499    rax_20 = sub_42f9b0(&amp;var, arg1, arg2)        // VM state-machine dispatcher

// ─── Gate 3: Final integrity seal ───
004194b1    rax_21 = sub_41b480(arg1, arg2, rax_12)       // Layer 12: S-box → AES → PRNG → hash
004194d5    sub_434000(&amp;var, arg1, arg2)                  // Final hash comparison
00419570    return rbx_5                                    // 1 = accepted, 0 = rejected</code></pre>
            <p>The three gates operate in sequence:</p>
            <ul>
                <li><strong>Gate 1 — Direct validation:</strong> <code>sub_42f560</code> (timing) → <code>sub_419ef0</code> (length) → <code>sub_433250</code> (Layers 5–11). Each is a hard gate with early-exit on failure — contrary to what one might expect, the checks are <em>not</em> all-or-nothing; the first failure short-circuits.</li>
                <li><strong>Gate 2 — VM-dispatched validation:</strong> <code>sub_42f9b0</code> is a state-machine dispatcher (from <code>src/vm/dispatcher.rs</code>) that performs redundant checks in obfuscated form, making single-point patching insufficient.</li>
                <li><strong>Gate 3 — Integrity seal:</strong> <code>sub_41b480</code> (Layer 12) chains S-box → AES MixColumns → PRNG shuffle → final hash. <code>sub_434000</code> performs the final comparison.</li>
            </ul>
            <p><strong>Master validation chain — sub_433250 (decompiler output):</strong></p>
            <pre><code class="language-c">// sub_433250 — Chains Layers 5–11 with short-circuit AND
0043326b    if (sub_4332e0(arg2, arg3) != 0          // Layer 5:  charset + checksum
     &amp;&amp; sub_433470(arg2, arg3) != 0                  // Layer 6:  structure + digit hash
     &amp;&amp; sub_433510(arg1, arg2, arg3) != 0            // Layer 7:  full-key SipHash #1
     &amp;&amp; sub_433580(arg1, arg2, arg3) != 0            // Layer 8:  full-key SipHash #2
     &amp;&amp; sub_433600(arg1, arg2, arg3) != 0            // Layer 9:  full-key SipHash #3
     &amp;&amp; sub_433670(arg1, arg2, arg3) != 0)           // Layer 10: 4-segment SipHash
004332d2        return sub_433810(arg1, arg2, arg3)      // Layer 11: polynomial eval
004332de    return 0</code></pre>
            <p>The short-circuit AND is computationally efficient but provides a timing side-channel. Gate 2's VM dispatcher mitigates this by performing the same checks in a harder-to-instrument execution model.</p>

            <h3>4.4 VM Dispatcher — sub_42f9b0</h3>
            <p>The VM dispatcher is a state-machine executor from <code>src/vm/dispatcher.rs</code> that processes the key through computed jump targets encoded as 64-bit state IDs. This provides an obfuscated redundant validation path parallel to <code>sub_433250</code>.</p>
            <p>Each state transition performs an operation (rotation, XOR, hash, comparison) and advances the state ID. Key states identified from the decompiler:</p>
            <pre><code class="language-text">VM State Machine — sub_42f9b0 (selected states from decompiler output):

State 0x2b3c4d5e6f708091:   Length gate → key_len == 0x1c (28)
State 0x4d5e6f708091a2b3:   ASCII validation → each byte in [A-Z0-9_]
State 0x5e6f708091a2b3c4:   Underscore gates → key[0xa]='_', key[0xf]='_', key[0x17]='_'
State 0x6f708091a2b3c4d5:   Checksum gate → abs(ascii_sum - 0x76d) &lt; tolerance
State -0x3b2a1908f7e6c4b3:  Segment 1 SipHash → sub_431e40(key, k0, k1)
State -0x2a1908f7e6d5b3a2:  Segment 2 SipHash → sub_431e40(key+7, k0, k1)
State -0x1908f7e6d5c4a291:  Segment 3 SipHash → sub_431e40(key+14, k0, k1)
State -0x8f7e6d5c4b39180:   Segment 4 SipHash → sub_431e40(key+21, k0, k1)
State 0x6e7f8091a2b3d5f7:   Failure terminal state</code></pre>
            <p>State IDs follow an arithmetic progression (<code>+0x1111111111111111</code> between consecutive states). Operations within each state include <code>ROL</code>/<code>ROR</code> rotations, <code>sub_42f160</code> (XOR/mix), and <code>sub_431e40</code> (inlined 7-byte SipHash-2-4 — identical to the function used in Layer 10's direct path). The segment SipHash key pairs match those in <code>sub_433670</code>, confirming the redundancy between Gate 1 and Gate 2.</p>

            <h2>5. Verification Layers — Deep Analysis</h2>

            <h3>5.1 Layers 1–3: Anti-Analysis Framework</h3>
            <p><strong>Layer 1 — RDTSC Timing Gate (sub_42d510)</strong></p>
            <p>The binary reads the Time Stamp Counter via <code>RDTSC</code> at two points bracketing a controlled computation, then checks whether the delta exceeds a threshold. Under a debugger with single-stepping or software breakpoints in the measured region, the elapsed cycle count spikes dramatically, triggering the anti-debug path.</p>
            <pre><code class="language-asm">; sub_42d510
rdtsc
shl rdx, 0x20
or  rax, rdx          ; rax = full 64-bit TSC
; ... intervening computation ...
rdtsc
shl rdx, 0x20
or  rax, rdx
sub rax, &lt;saved_tsc&gt;  ; delta
cmp rax, &lt;threshold&gt;
ja  anti_debug_path</code></pre>

            <p><strong>Layer 2 — Secondary Timing (sub_42d340)</strong></p>
            <p>A second RDTSC-based check with a different threshold and measurement window. Having two independent timing checks with different parameters makes it harder to patch around — you need to identify and neutralize both.</p>

            <p><strong>Layer 3 — Environment and Clock Check (sub_42f560)</strong></p>
            <p>Uses <code>clock_gettime(CLOCK_MONOTONIC, ...)</code> via a direct syscall (not through libc) to measure wall-clock time across a calibration region. This catches debugger-induced slowdowns that RDTSC might miss in virtualized environments where TSC can be emulated.</p>
            <p>The anti-analysis strings extracted from the binary (detailed in Section 3.3) confirm that <code>src/protection/environment.rs</code> checks for: <code>TracerPid</code> in <code>/proc/self/status</code>, <code>ptrace</code> self-attach, known debugger processes (<code>ida</code>, <code>ida64</code>, <code>x64dbg</code>, <code>ollydbg</code>, <code>radare2</code>), VM MAC address prefixes (<code>00:0c:29</code>, <code>00:50:56</code>, <code>08:00:27</code>), instrumentation frameworks (<code>frida</code>, <code>xposed</code>, <code>substrate</code>), and environment variables (<code>LD_PRELOAD</code>, <code>LD_DEBUG</code>). These layers gate execution but do not affect key verification — running natively without a debugger satisfies all three.</p>
            <p><strong>Binary evidence — sub_42d510 (Layer 1 RDTSC init):</strong></p>
            <pre><code class="language-c">// sub_42d510 — RDTSC timing context initialization (decompiler output)
0042d517    temp0, temp1 = _rdtsc(tsc)                    // Read TSC baseline
0042d523    result = malloc(0x80)                          // 128-byte timing context
0042d537    arg1[3] = zx.q(temp0) | zx.q(temp1) &lt;&lt; 0x20  // Store full 64-bit TSC
0042d53b    *arg1 = 0x10                                   // Buffer capacity = 16 slots
0042d54e    arg1[4] = 0x2710                               // Threshold = 10,000 cycles</code></pre>
            <p>The threshold <code>0x2710</code> (10,000 TSC cycles) is calibrated for debugger detection: normal execution completes the measured region in ~100–1,000 cycles, while single-stepping inflates the delta by 10–100×.</p>
            <p><strong>Binary evidence — sub_42f560 (Layer 3 clock_gettime gate):</strong></p>
            <pre><code class="language-c">// sub_42f560 — clock_gettime(CLOCK_MONOTONIC) timing gate (decompiler output)
0042f575    if (clock_gettime(0, &amp;tp) == 0xffffffff)      // CLOCK_MONOTONIC = 0
                // → panic on syscall failure
0042f586    if (var_28 u&gt;= 0x3b9aca00)                    // 0x3b9aca00 = 10^9 (1 second in ns)
                // → nanosecond overflow check
0042f5d2    tp_2 = var_28 * 0x3b9aca00 + zx.q(var_20)    // Convert to nanosecond timestamp
0042f5ef    return sub_42f290(tp)                          // Compare delta against threshold</code></pre>
            <p>The <code>clock_gettime</code> check catches debugger-induced slowdowns that RDTSC misses in virtualized environments where TSC can be emulated. The constant <code>0x3b9aca00</code> = 10^9 is the standard second-to-nanosecond conversion factor.</p>

            <h3>5.2 Layer 4: Key Length — sub_419ef0</h3>
            <p>Straightforward length comparison:</p>
            <pre><code class="language-c">// sub_419ef0
if (key_len != 28) return 0;
return 1;</code></pre>
            <p>The key must be exactly 28 bytes. No padding, no null terminator included in the count.</p>
            <p><strong>Binary evidence (decompiler output):</strong></p>
            <p>The decompiler reveals a subtly obfuscated comparison — the length is checked through an XOR gate rather than a direct <code>cmp</code>:</p>
            <pre><code class="language-c">// sub_419ef0 — Length check (decompiler output)
return sub_42f690() ^ arg1 != 0x1c    // sub_42f690() always returns 0
                                        // Effective: key_len != 28 → return 0</code></pre>
            <p>The call to <code>sub_42f690()</code> is a constant function returning 0, making the XOR an identity operation. This is a minimal obfuscation layer from <code>src/obfuscation/flatten.rs</code>.</p>

            <h3>5.3 Layer 5: Character Classes and Checksum — sub_4332e0</h3>
            <p>This layer enforces the character set and computes a checksum over the entire key.</p>
            <p><strong>Character class rules</strong> (extracted from the branching logic):</p>
            <pre><code class="language-c">for (int i = 0; i < 28; i++) {
    uint8_t c = key[i];
    if (c - 0x41 < 0x1a)      continue;  // A-Z (uppercase only)
    if (c - 0x30 < 0x0a)      continue;  // 0-9
    if (c == 0x5f)             continue;  // underscore '_'
    return 0;                             // invalid character
}</code></pre>
            <p>The valid character set is: <code>[A-Z]</code>, <code>[0-9]</code>, and <code>_</code>. No lowercase letters. This gives 37 possible values per position (36 for non-underscore positions, since underscores are structurally fixed).</p>
            <p><strong>Additional constraints:</strong></p>
            <ul>
                <li>Exactly 3 underscores must be present</li>
                <li>At least 1 uppercase letter</li>
                <li>At least 1 digit</li>
            </ul>
            <p><strong>SSE-accelerated checksum:</strong></p>
            <p>The function uses SSE2 instructions to compute the sum of all 28 ASCII values in parallel. The key bytes are loaded into XMM registers, zero-extended to 16-bit lanes, and horizontally summed. The final result is compared against <strong>1901 (0x76D)</strong>:</p>
            <pre><code class="language-c">uint32_t sum = 0;
for (int i = 0; i < 28; i++) sum += key[i];
if (sum != 1901) return 0;</code></pre>
            <p>The SSE path is functionally equivalent to the scalar loop above — it is a performance optimization, not a different algorithm. The target sum of 1901 was confirmed via disassembly of the <code>cmp</code> instruction operand.</p>
            <p><strong>Binary evidence — sub_4332e0 (decompiler output, key excerpts):</strong></p>
            <pre><code class="language-c">// sub_4332e0 — Character validation + SSE checksum (decompiler output)

// Character class validation loop:
0043331e    if (r9_1 - 0x41 u&lt; 0x1a)  rdx_1 = 1          // Uppercase [A-Z] → set has_upper flag
00433348    if (r9_1 - 0x30 u&lt; 0xa)   rsi = 1            // Digit [0-9] → set has_digit flag
00433364    if (r9_1 == 0x5f) { rcx_1 += 1; r8_1 = 1 }   // Underscore '_' → count++ &amp; flag
00433394    if (r9_2 != 0x5f) break                        // Not in valid set → reject

// Final constraint check:
004333b7    if ((rdx_1 &amp; rsi &amp; r8_1 &amp; 1) != 0             // All three flags must be set
            &amp;&amp; rcx_1 == 3)                                 // Exactly 3 underscores

// SSE2 SIMD horizontal sum (checksum):
004333bd    zmm1 = *arg1                                    // Load first 16 key bytes
004333c1    zmm2 = zx.o(*(arg1 + 0x10))                   // Load bytes 16–27
004333d3    temp0 = _mm_unpackhi_epi8(zmm1, 0)            // Zero-extend to 16-bit
004333db    zmm5 = _mm_unpacklo_epi16(temp0, 0)           // Zero-extend to 32-bit
004333eb    zmm6 = _mm_add_epi32(...)                      // Accumulate partial sums
00433466    result.b = (final_horizontal_sum == 0x76d)     // Compare to 1901 (0x76D)</code></pre>
            <p>The SSE path uses <code>_mm_unpackhi_epi8</code>/<code>_mm_unpacklo_epi16</code> for zero-extension and <code>_mm_add_epi32</code> for parallel accumulation — a textbook SIMD horizontal sum pattern. The final comparison at <code>0x433466</code> directly proves the target sum <code>0x76d</code> = 1901.</p>

            <h3>5.4 Layer 6: Structure and Digit Hash — sub_433470</h3>
            <p>This layer enforces the key's internal structure and validates the last four characters.</p>
            <p><strong>Structural constraints:</strong></p>
            <pre><code class="language-c">if (key[10] != '_') return 0;
if (key[15] != '_') return 0;
if (key[23] != '_') return 0;

for (int i = 24; i < 28; i++) {
    if (key[i] - 0x30 >= 0x0a) return 0;  // must be digit
}</code></pre>
            <p>This establishes the key format:</p>
            <pre><code class="language-text">XXXXXXXXXX_XXXXX_XXXXXXX_DDDD
0         10    15      23  27</code></pre>
            <p>Where X ∈ <code>[A-Z0-9]</code> and D ∈ <code>[0-9]</code>.</p>
            <p><strong>Digit hash (SipHash-2-4):</strong></p>
            <p>The last 4 characters (positions 24–27) are hashed independently:</p>
            <pre><code class="language-c">uint64_t h = siphash24(&key[24], 4, 0x5945415248415348, 0x4b45593031303230);
if (h != 0x61ffb66cadf3cecd) return 0;</code></pre>
            <p>The SipHash keys decode to ASCII strings:</p>
            <ul>
                <li>k0 = <code>0x5945415248415348</code> → "YEARHASH" (little-endian byte order)</li>
                <li>k1 = <code>0x4b45593031303230</code> → "KEY01020"</li>
            </ul>
            <p>The "YEAR" in the key name is a strong hint. Combined with the CrackMe's publication context, this immediately suggested the digits might be <code>2026</code>.</p>
            <p><strong>Binary evidence — sub_433470 (decompiler output):</strong></p>
            <pre><code class="language-c">// sub_433470 — Structure + digit hash (decompiler output)
004334a8    if (arg2 == 0x1c                               // key_len == 28
         &amp;&amp; *(arg1 + 0xa) == 0x5f                         // key[10] == '_'
         &amp;&amp; *(arg1 + 0xf) == 0x5f                         // key[15] == '_'
         &amp;&amp; *(arg1 + 0x17) == 0x5f                        // key[23] == '_'
         &amp;&amp; *(arg1 + 0x18) - 0x30 u&lt; 0xa                 // key[24] is digit
         &amp;&amp; *(arg1 + 0x19) - 0x30 u&lt;= 9                  // key[25] is digit
         &amp;&amp; *(arg1 + 0x1a) - 0x30 u&lt;= 9                  // key[26] is digit)
004334ae    rax_4.b = *(arg1 + 0x1b) - 0x30               // key[27]
004334b2    if (rax_4.b u&lt;= 9)                             // key[27] is digit
004334f7    result.b = sub_433b80(arg1 + 0x18, 4,          // SipHash(key[24:28], 4,
                 0x5945415248415348,                        //   k0 = "YEARHASH",
                 0x4b45593031303230)                        //   k1 = "KEY01020")
                 == 0x61ffb66cadf3cecd                      // expected hash</code></pre>
            <p>Every constant is directly visible in the decompiler output: underscore positions at <code>0xa</code>, <code>0xf</code>, <code>0x17</code> (decimal 10, 15, 23), the digit range check <code>- 0x30 u&lt; 0xa</code>, the SipHash key pair, and the expected hash value. No constant required manual extraction from raw bytes.</p>

            <h3>5.5 Layers 7–9: Full-Key SipHash Triplet</h3>
            <p>Three independent SipHash-2-4 computations over the entire 28-byte key, each with different key pairs:</p>
            <div class="bg-[#0a0a0a] p-4 rounded-lg border border-white/5 font-mono text-sm space-y-2">
                <p><strong>Layer 7 — sub_433510:</strong><br>
                k0 = 0xdeadbeefcafebabe, k1 = 0x0123456789abcdef<br>
                <span class="text-blue-400">expected = 0x3ba502e7231ce03e</span></p>
                
                <p><strong>Layer 8 — sub_433580:</strong><br>
                k0 = 0xfedcba9876543210, k1 = 0x1111111111111111<br>
                <span class="text-blue-400">expected = 0xd0e9612ed3986da4</span></p>
                
                <p><strong>Layer 9 — sub_433600:</strong><br>
                k0 = 0xaaaaaaaaaaaaaaaa, k1 = 0x5555555555555555<br>
                <span class="text-blue-400">expected = 0x6eedaa1c6002baee</span></p>
            </div>
            <p>These three layers collectively pin down the full key. Given SipHash-2-4's 64-bit output and strong pseudorandom properties, the probability of a false positive passing all three checks is approximately 2^-192 — effectively zero. However, these checks operate on the full 28-byte key, which makes them useless for incremental brute-forcing. Their role is final validation, not decomposition.</p>
            <p><strong>Binary evidence — sub_433510 (Layer 7 decompiler output):</strong></p>
            <pre><code class="language-c">// sub_433510 — Full-key SipHash #1 (decompiler output)
00433514    if (arg3 != 0x1c) return 0                     // key_len guard
0043353d    rax_1 = sub_433b80(arg2, 0x1c,                 // SipHash(key, 28,
                 -0x2152411035014542,                        //   k0: -0x2152411035014542
                 0x123456789abcdef)                          //   k1: 0x0123456789abcdef)
00433542    *(arg1 + 8) ^= rax_1                            // XOR into running accumulator
00433546    *(arg1 + 0x10) += 1                             // Increment layer counter
00433571    result.b = rax_1 == 0x3ba502e7231ce03e         // Expected hash</code></pre>
            <p>The decompiler shows k0 as <code>-0x2152411035014542</code> — the two's complement representation of <code>0xdeadbeefcafebabe</code> (since <code>0x10000000000000000 - 0xdeadbeefcafebabe = 0x2152411035014542</code>). This is how x86_64 encodes 64-bit immediates for <code>imul</code>/<code>mov</code> when the high bit is set. Each layer also XORs its result into a running accumulator at <code>*(arg1 + 8)</code> and increments a counter at <code>*(arg1 + 0x10)</code> — these values are used by the VM dispatcher (Gate 2) for cross-validation. Layers 8 and 9 follow an identical structure with their respective key pairs.</p>

            <h3>5.6 Layer 10: Four-Segment SipHash Decomposition — sub_433670</h3>
            <p>This is the critical layer for the solving strategy. The 28-byte key is split into four 7-byte segments, and each segment is hashed independently:</p>
            <div class="bg-[#0a0a0a] p-4 rounded-lg border border-white/5 font-mono text-sm space-y-2">
                <p><strong>Segment 1 — key[0:7]:</strong><br>k0 = 0x1234567890abcdef, k1 = 0xfedcba0987654321, <span class="text-green-400">expected = 0x64ab81fecce00947</span></p>
                <p><strong>Segment 2 — key[7:14]:</strong><br>k0 = 0x23456789a1bcdf00, k1 = 0xdcba97e7654320ff, <span class="text-green-400">expected = 0x3fbb8e4ae1100e16</span></p>
                <p><strong>Segment 3 — key[14:21]:</strong><br>k0 = 0x3456789ab2cdf011, k1 = 0xba9875c54320fedd, <span class="text-green-400">expected = 0x878578dd58494be0</span></p>
                <p><strong>Segment 4 — key[21:28]:</strong><br>k0 = 0x456789abc3df0122, k1 = 0x987653a320fedcbb, <span class="text-green-400">expected = 0x7d54d6c20d46d7ca</span></p>
            </div>
            <p>Each segment can be brute-forced independently. With structural constraints (underscores at fixed positions, digits at 24–27), the effective search space per segment is drastically reduced from 36^7 ≈ 78 billion.</p>
            <p>The SipHash key pairs for the four segments follow a visible rotation pattern in their hex digits — the author clearly generated them systematically rather than randomly. This does not weaken the cryptographic properties; it is purely an aesthetic choice.</p>
            <p><strong>Binary evidence — sub_433670 (decompiler output):</strong></p>
            <pre><code class="language-c">// sub_433670 — 4-segment SipHash decomposition (decompiler output)
00433674    if (arg3 != 0x1c) return 0                      // key_len guard

// Segment 1: key[0:7]
004336a9    rax = sub_433b80(arg2, 7,                       // SipHash(key, 7,
                 0x1234567890abcdef,                          //   k0,
                 -0x12345f6789abcdf)                          //   k1 = 0xfedcba0987654321)
004336e1    if (rax == 0x64ab81fecce00947)                  // Segment 1 expected

// Segment 2: key[7:14]
00433704    rax_2 = sub_433b80(arg2 + 7, 7,                 // SipHash(key+7, 7,
                 0x23456789a1bcdf00,                          //   k0,
                 -0x234568189abcdf01)                         //   k1 = 0xdcba97e7654320ff)
0043373c    if (rax_2 == 0x3fbb8e4ae1100e16)               // Segment 2 expected

// Segment 3: key[14:21]
0043375f    rax_4 = sub_433b80(arg2 + 0xe, 7,              // SipHash(key+14, 7,
                 0x3456789ab2cdf011,                          //   k0,
                 -0x45678a3abcdf0123)                         //   k1 = 0xba9875c54320fedd)
00433797    if (rax_4 == -0x787a8722a7b6b420)              // = 0x878578dd58494be0

// Segment 4: key[21:28]
004337b9    rax_6 = sub_433b80(arg2 + 0x15, 7,             // SipHash(key+21, 7,
                 0x456789abc3df0122,                          //   k0,
                 -0x6789ac5cdf012345)                         //   k1 = 0x987653a320fedcbb)
004337f1    if (rax_6 == 0x7d54d6c20d46d7ca)               // Segment 4 expected</code></pre>
            <p>All four <code>sub_433b80</code> calls are visible at addresses <code>0x4336a9</code>, <code>0x433704</code>, <code>0x43375f</code>, <code>0x4337b9</code>. Each passes <code>7</code> as the length and <code>arg2 + offset</code> (segment offsets: 0, 7, 0xe=14, 0x15=21). The k1 values appear in two's complement: <code>-0x12345f6789abcdf</code> = <code>0xfedcba0987654321</code>. Each hash also feeds into a <code>rol.q(accumulator, 7) + hash</code> chain at <code>*(arg1 + 8)</code> for cross-layer integrity.</p>

            <h3>5.7 Layer 11: Polynomial Evaluation with fmix64 — sub_433810</h3>
            <p>This layer treats the key as coefficients of a degree-27 polynomial evaluated at five distinct points:</p>
            <pre><code class="language-c">for (int p = 0; p < 5; p++) {
    uint64_t x = eval_points[p];
    uint64_t result = 0;
    uint64_t x_pow = 1;
    for (int i = 0; i < 28; i++) {
        result += (uint64_t)key[i] * x_pow;
        x_pow *= x;
    }
    result = fmix64(result);
    if (result != expected[p]) return 0;
}</code></pre>
            <p><strong>Evaluation points:</strong> x ∈ {23, 43, 61, 79, 97} — all prime numbers.</p>
            <p><strong>Expected fmix64 outputs</strong> (stored at <code>data_40cd38</code>):</p>
            <pre><code class="language-text">x=23 → 0x1c4bda1d97a28234
x=43 → 0x4ccc43a8bca2aaa0
x=61 → 0xb78b885d47924216
x=79 → 0x6496916f31be02b1
x=97 → 0xb50b9876a5566c31</code></pre>
            <p>The <code>fmix64</code> function is the MurmurHash3 64-bit finalizer — a standard bit-mixing bijection:</p>
            <pre><code class="language-c">uint64_t fmix64(uint64_t k) {
    k ^= k >> 33;
    k *= 0xff51afd7ed558ccd;
    k ^= k >> 33;
    k *= 0xc4ceb9fe1a85ec53;
    k ^= k >> 33;
    return k;
}</code></pre>
            <p>Identified by the characteristic constant pair <code>0xff51afd7ed558ccd</code> / <code>0xc4ceb9fe1a85ec53</code> and the triple shift-33 pattern. These constants appear in the disassembly as their two's-complement negations (<code>-0xae502812aa7333</code> and <code>-0x3b314601e57a13ad</code>), which is how the Rust compiler emits <code>imul</code> with negative immediates on x86_64.</p>
            <p>The polynomial check provides 5 × 64 = 320 bits of constraint on the key. Since fmix64 is a bijection, each evaluation uniquely determines the polynomial value at that point. Five evaluation points on a degree-27 polynomial over a 64-bit ring do not fully determine the polynomial (you would need 28 points for that), but they provide strong redundancy when combined with the other layers.</p>
            <p><strong>Binary evidence — sub_433810 (decompiler output, key excerpts):</strong></p>
            <pre><code class="language-c">// sub_433810 — Polynomial evaluation (decompiler output)
00433814    if (arg3 != 0x1c) return 0                      // key_len guard

// Evaluation points (memcpy'd as 5×qword array at 0x433828):
//   {0x17, 0x2b, 0x3d, 0x4f, 0x61} = {23, 43, 61, 79, 97}  ← all prime

// All 28 key bytes loaded as uint64_t:
00433855    rax   = zx.q(*arg2)                             // key[0]
0043385d    rax_1 = zx.q(arg2[1])                           // key[1]
            // ... key[2] through key[27] ...
0043392f    rsi   = zx.q(arg2[0x1b])                        // key[27]

// For each evaluation point (loop: r10 = 0 to 0x28, step 8):
0043394d    rbx_1 = *(&amp;var_58 + r10)                       // x = eval_points[i]
00433963    r11_2 = rbx_1 * rbx_1                           // x²
00433973    r11_3 = r11_2 * rbx_1                           // x³
            // ... powers up to x²⁷ ...

// Polynomial: P(x) = key[0] + key[1]*x + key[2]*x² + ... + key[27]*x²⁷
004339cf    r15_12 = r11_8*rax_8 + r11_7*rax_7 + ... + rbx_1*rax_1 + rax

// fmix64 applied to polynomial result:
00433b04    r11_32 = (rbx_4 u&gt;&gt; 0x21 ^ rbx_4)             // shift-33 XOR
                * -0xae502812aa7333                          // = 0xff51afd7ed558ccd
00433b1c    rbx_8 = (r11_32 u&gt;&gt; 0x21 ^ r11_32)            // shift-33 XOR
                * -0x3b314601e57a13ad                        // = 0xc4ceb9fe1a85ec53
00433b27    r11_35 = rbx_8 u&gt;&gt; 0x21 ^ rbx_8               // shift-33 XOR

// Compare against expected values from data_40cd38:
00433b42    rbx_9 = *(r10 + &amp;data_40cd38)                  // expected[i]
00433b54    do while (r11_35 == rbx_9)                      // must match all 5</code></pre>
            <p>The evaluation points <code>{23, 43, 61, 79, 97}</code> are confirmed from the <code>memcpy</code> at <code>0x433828</code>. The fmix64 constants at <code>0x433b04</code> and <code>0x433b1c</code> match MurmurHash3 exactly (shown in two's complement form). The expected values at <code>data_40cd38</code> are loaded at <code>0x433b42</code> and compared per-iteration.</p>

            <h3>5.8 Layer 12: S-Box, AES MixColumns, xoshiro256, Final Hash — sub_41b480</h3>
            <p>The final and most complex layer. It chains four distinct operations:</p>
            <ol>
                <li><strong>S-box substitution:</strong> Each key byte is mapped through a 256-byte substitution table initialized in the orchestrator. The S-box contents are deterministic (derived from constants in the binary, not from the key).</li>
                <li><strong>AES MixColumns:</strong> The substituted key bytes are grouped into 4-byte columns and processed through the AES MixColumns transformation. This is identified by the characteristic Galois field multiplication in GF(2^8) with the irreducible polynomial x^8 + x^4 + x^3 + x + 1 (0x11B) and the fixed MixColumns matrix {2,3,1,1; 1,2,3,1; 1,1,2,3; 3,1,1,2}.</li>
                <li><strong>xoshiro256** PRNG Fisher-Yates shuffle:</strong> A xoshiro256** generator (seeded deterministically from binary constants) produces a permutation via the Fisher-Yates algorithm. This permutation is applied to the post-MixColumns byte array, effectively shuffling the transformed key bytes into a specific order.</li>
                <li><strong>Final hash comparison:</strong> The shuffled byte array is hashed (likely through another SipHash or a custom accumulator) and compared against: <code>expected = 0xf5144b61a9b8c599</code></li>
            </ol>
            <p>This layer is the "binary knows its own shape" aspect mentioned in the challenge description — the S-box and PRNG seed may incorporate data derived from the binary's own bytes (sections, headers, or code hashes), making the verification dependent on the binary's integrity. Any patching of the binary would alter the S-box or PRNG state, invalidating the key check.</p>
            <p>For the solving strategy, Layer 12 serves as a final confirmation but does not need to be independently brute-forced. The segment-level SipHash decomposition (Layer 10) combined with the full-key SipHash triplet (Layers 7–9) sufficiently constrains the key to a unique solution. Layer 12 simply provides additional insurance.</p>
            <p><strong>Binary evidence — sub_41b480 (decompiler output, annotated):</strong></p>
            <pre><code class="language-c">// sub_41b480 — Layer 12: S-box + AES MixColumns + xoshiro256** + final hash

// ── Step 1: S-box substitution with fmix64 per byte ──
0041b4d7    rax = -0x61c8864680b583eb                       // = 0x9e3779b97f4a7c15 (golden ratio)
0041b4e1    r14 = 0x5a5a5a5a5a5a5a5a                       // Hash state init
0041b522    r8_6 = r14 * 0x1f                               // state * 31
            + (zx.q(zx.d(
            *((zx.q(arg1[rbx_1]) ^ zx.q(rcx_1))             // key[i] XOR rolling counter
             + &amp;data_40cb9b[0x98])) &lt;&lt; 3) ^ rax)            // S-box lookup + shift + XOR
0041b52f    r11_7 = (r8_6 u&gt;&gt; 0x21 ^ r8_6)                // fmix64 per byte
                * -0xae502812aa7333                           // = 0xff51afd7ed558ccd
0041b555    rcx_1 += 0x1b                                    // Counter advances by 27

// ── Step 2: AES MixColumns (GF(2^8) multiply, 4 rounds) ──
0041b5b3    rcx_4 = rcx_3 * 2                               // xtime(b) = b &lt;&lt; 1
0041b5c3    rcx_5 = rcx_4 ^ 0x1b                            // XOR reduction polynomial
0041b5c6    if (rcx_3 s&gt;= 0) rcx_5 = rcx_4                 // Only reduce if bit 7 set
            // ↑ This is the AES GF(2^8) xtime operation:
            //   xtime(b) = (b &lt;&lt; 1) ^ (0x1b if b &amp; 0x80 else 0)
0041b5f0    r11_8 = rcx_3 ^ r9_2 ^ r15_2 ^ rdx_2 ^ rcx_5  // MixColumn byte
            // ... 8 bytes per column, 4 rounds (i = 0 to 3) ...

// ── Step 3: xoshiro256** PRNG with Fisher-Yates shuffle ──
// State seeded from arg3 via SplitMix64:
0041b939    rcx_27 = ((-0x61c8864680b583eb + arg3) u&gt;&gt; 0x1e
                ^ (-0x61c8864680b583eb + arg3))
                * -0x40a7b892e31b1a47                       // SplitMix64 mix constant
0041b951    rsi_20 = (...) * -0x6b2fb644ecceee15            // SplitMix64 mix constant
// xoshiro256** output function:
0041ba18    rax_11 = rol.q(rsi_24 * 5, 7) * 9              // rol(s1*5, 7)*9
// Fisher-Yates shuffle (100 elements):
0041ba42    rdx_9 = modu.dp.d(0:(rax_11.d), i_1.d)         // index = PRNG_out % i
0041ba7b    swap(permutation[i], permutation[rdx_9])        // Swap elements
0041ba83    i_1 -= 1                                         // i: 0x64 (100) down to 2

// ── Step 4: Final hash (fmix64 → bswap → fmix64) ──
0041bc5c    rax_29 = (r14 u&gt;&gt; 0x21 ^ r14) * -0xae502812aa7333     // fmix64 #1
0041bc78    rax_33 = _bswap(rdx_14 u&gt;&gt; 0x21 ^ rdx_14)            // byte-swap
0041bc85    rdx_18 = (rax_33 u&gt;&gt; 0x21 ^ rax_33) * -0xae502812aa7333  // fmix64 #2
0041bca1    result_1 = rax_37 u&gt;&gt; 0x21 ^ rax_37             // Final hash

// Comparison:
0041bcc3    expected = -0xbebb49e56473a67                    // = 0xf4144b61a9b8c599
0041bcdb    result.b = (computed_hash == expected)           // Must match</code></pre>
            <p>Key identifications from the decompiler evidence:</p>
            <ul>
                <li><strong>S-box:</strong> Located at <code>data_40cb9b + 0x98</code> with a rolling XOR counter (<code>+0x1b</code> per byte) creating position-dependent substitution.</li>
                <li><strong>AES MixColumns:</strong> The <code>xtime</code> pattern at <code>0x41b5b3</code>–<code>0x41b5c6</code> is textbook: <code>(b &lt;&lt; 1) ^ (0x1b &amp; -(b &gt;&gt; 7))</code>. The reduction polynomial <code>0x1b</code> = x^4+x^3+x+1 confirms AES GF(2^8).</li>
                <li><strong>xoshiro256**:</strong> The output function <code>rol(s1*5, 7)*9</code> at <code>0x41ba18</code> is the exact formula. State seeded via SplitMix64 constants <code>0xbf58476d1ce4e5b9</code> and <code>0x94d049bb133111eb</code>.</li>
                <li><strong>Fisher-Yates:</strong> 100-element shuffle (<code>i = 0x64</code> down to 2) with modular index via <code>modu.dp</code>.</li>
                <li><strong>Final hash:</strong> Double fmix64 with <code>_bswap</code> (endian flip) between applications — ensures the hash is not trivially invertible despite fmix64 being a bijection.</li>
                <li><strong>Golden ratio constant:</strong> <code>0x9e3779b97f4a7c15</code> (≈ φ⋅ 2^64) at <code>0x41b4d7</code> is a well-known hash initialization constant (used in Fibonacci hashing, Knuth's multiplicative method).</li>
            </ul>

            <h2>6. Cryptographic Primitive Identification</h2>

            <h3>6.1 SipHash-2-4 — sub_433b80</h3>
            <p>The core hash function used across Layers 6–10 is SipHash-2-4, identified by its initialization constants and round structure.</p>
            <p><strong>Initialization (from disassembly):</strong></p>
            <pre><code class="language-asm">; sub_433b80
mov  rax, 0x736f6d6570736575   ; "somepseu"
xor  rax, rdi                   ; v0 = magic0 ^ k0
mov  rbx, 0x646f72616e646f6d   ; "dorandom"
xor  rbx, rsi                   ; v1 = magic1 ^ k1
mov  rcx, 0x6c7967656e657261   ; "lygenera"
xor  rcx, rdi                   ; v2 = magic2 ^ k0
mov  rdx, 0x7465646279746573   ; "tedbytes"
xor  rdx, rsi                   ; v3 = magic3 ^ k1</code></pre>
            <p>These four 64-bit constants spell out "somepseudorandomlygeneratedbytes" — the canonical SipHash initialization vector defined in the original paper by Aumasson and Bernstein (2012). This is a textbook SipHash-2-4 implementation.</p>
            <p><strong>Round structure verification:</strong></p>
            <p>The SIPROUND consists of:</p>
            <ul>
                <li><code>v0 += v1; v1 = ROTL(v1, 13); v1 ^= v0; v0 = ROTL(v0, 32);</code></li>
                <li><code>v2 += v3; v3 = ROTL(v3, 16); v3 ^= v2;</code></li>
                <li><code>v0 += v3; v3 = ROTL(v3, 21); v3 ^= v0;</code></li>
                <li><code>v2 += v1; v1 = ROTL(v1, 17); v1 ^= v2; v2 = ROTL(v2, 32);</code></li>
            </ul>
            <p>The rotation constants (13, 32, 16, 21, 17, 32) match SipHash exactly. The "2-4" variant applies 2 rounds per message block and 4 rounds at finalization, confirmed by counting the SIPROUND macro expansions in the disassembly:</p>
            <ul>
                <li>Per 8-byte message block: 2 rounds (two groups of the add/rotate/xor sequence)</li>
                <li>Finalization (after <code>v2 ^= 0xff</code>): 4 rounds</li>
            </ul>
            <p><strong>Tail processing:</strong></p>
            <p>For messages not aligned to 8 bytes, the remaining bytes are packed into a final qword in little-endian order with the message length encoded in the most significant byte:</p>
            <pre><code class="language-c">uint64_t m = (uint64_t)len << 56;
// pack remaining bytes in LE order into lower bytes of m</code></pre>
            <p>This matches the reference implementation exactly.</p>

            <h3>6.2 MurmurHash3 fmix64</h3>
            <p>Identified in Layer 11's polynomial evaluation by the two multiplication constants and the triple right-shift-by-33 pattern:</p>
            <pre><code class="language-c">k ^= k >> 33
k *= 0xff51afd7ed558ccd
k ^= k >> 33
k *= 0xc4ceb9fe1a85ec53
k ^= k >> 33</code></pre>
            <p>This is a well-known 64-bit bit mixer used as the finalization step in MurmurHash3_x64_128. It is a bijection (invertible), which means it does not lose information — it merely diffuses the bits of the polynomial evaluation result before comparison.</p>

            <h2>7. Constant Extraction and Disassembly Verification</h2>
            <p>Every cryptographic constant used in the solver was verified directly from disassembly, not trusted from decompiler output alone. The decompiler can misrepresent immediate values (sign extension, constant folding, dead-code elimination artifacts), so each constant was cross-checked against the raw instruction encoding.</p>
            <p><strong>Method:</strong> For each constant, the <code>mov</code> or <code>movabs</code> instruction loading it was identified in the disassembly view. The immediate operand bytes were read in their little-endian encoding and manually reconstructed to the 64-bit value. Example verification for Layer 6's k0:</p>
            <pre><code class="language-asm">; At sub_433470+0x??
movabs rdi, 0x5945415248415348</code></pre>
            <p>Instruction bytes: <code>48 BF 48 53 41 48 52 41 45 59</code></p>
            <p>Reading bytes 2–9 in little-endian: <code>48 53 41 48 52 41 45 59</code> → <code>0x5945415248415348</code> ✓</p>
            <p>ASCII decode (LE byte order): H-S-A-H-R-A-E-Y → reversed → "YEARHASH" ✓</p>
            <p>This process was repeated for all 24 key/expected-value constants across Layers 6–11. No discrepancies were found between decompiler output and raw disassembly.</p>

            <h2>8. Solver Design</h2>

            <h3>8.1 Strategy: Divide and Conquer via Layer 10</h3>
            <p>The key insight is that Layer 10 decomposes the 28-byte key into four independent 7-byte segments. Each segment can be brute-forced separately against its own SipHash target. The structural constraints from Layers 5 and 6 further reduce the search space:</p>
            
            <div class="overflow-x-auto my-6">
                <table class="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr class="text-text-muted border-b border-white/10">
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Phase</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Target</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Free Positions</th>
                            <th class="py-2 pr-4 font-mono uppercase text-xs">Constraint</th>
                            <th class="py-2 font-mono uppercase text-xs">Effective Space</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300">
                        <tr class="border-b border-white/5">
                            <td class="py-2 font-mono">1</td>
                            <td class="py-2">Digits [24–27]</td>
                            <td class="py-2">4 digits</td>
                            <td class="py-2">Each ∈ [0-9]</td>
                            <td class="py-2 font-mono">10^4 = 10,000</td>
                        </tr>
                        <tr class="border-b border-white/5">
                            <td class="py-2 font-mono">2</td>
                            <td class="py-2">Seg4 [21–27]</td>
                            <td class="py-2">Pos 21-22</td>
                            <td class="py-2">Phase 1 fixes 24-27, pos 23='_'</td>
                            <td class="py-2 font-mono">36^2 = 1,296</td>
                        </tr>
                        <tr class="border-b border-white/5">
                            <td class="py-2 font-mono">3</td>
                            <td class="py-2">Seg2 [7–13]</td>
                            <td class="py-2">6 positions</td>
                            <td class="py-2">Pos 10='_'</td>
                            <td class="py-2 font-mono">36^6 ≈ 2.18 × 10^9</td>
                        </tr>
                        <tr class="border-b border-white/5">
                            <td class="py-2 font-mono">4</td>
                            <td class="py-2">Seg3 [14–20]</td>
                            <td class="py-2">6 positions</td>
                            <td class="py-2">Pos 15='_'</td>
                            <td class="py-2 font-mono">36^6 ≈ 2.18 × 10^9</td>
                        </tr>
                        <tr class="border-b border-white/5">
                            <td class="py-2 font-mono">5</td>
                            <td class="py-2">Seg1 [0–6]</td>
                            <td class="py-2">7 positions</td>
                            <td class="py-2">Sum constraint eliminates last char</td>
                            <td class="py-2 font-mono">36^6 (pruned)</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <p><strong>Phase ordering rationale:</strong></p>
            <p>Phases 1 and 2 are trivially small and produce the rightmost segment immediately. Phase 5 (segment 1) is deferred to last because, once segments 2–4 are known, the ASCII sum constraint (Layer 5: total sum = 1901) determines the exact sum that segment 1 must contribute. This converts a 7-variable search into a 6-variable search where the 7th character is directly computed, and allows aggressive pruning of partial sums that cannot reach the target.</p>

            <h3>8.2 Sum Constraint Pruning in Phase 5</h3>
            <p>After Phases 1–4, the sum of positions 7–27 is known. The required sum for positions 0–6 is:</p>
            <pre><code class="language-text">target_seg1 = 1901 - sum(key[7..27])</code></pre>
            <p>Each character in segment 1 has a value in the range [48, 57] ∪ [65, 90] (digits and uppercase letters). The pruning logic operates at three levels:</p>
            <ol>
                <li><strong>After 3 characters:</strong> Check if the remaining 4 characters can sum to the residual (4×48 ≤ residual ≤ 4×90). If not, skip.</li>
                <li><strong>After 5 characters:</strong> Check if the remaining 2 characters can sum to the residual. If not, skip.</li>
                <li><strong>After 6 characters:</strong> Compute the required 7th character value directly. Check if it maps to a valid character (digit or uppercase letter). If valid, hash and compare. If not, skip.</li>
            </ol>
            <p>This reduces the Phase 5 search space by roughly an order of magnitude compared to naive enumeration.</p>

            <h3>8.3 Implementation</h3>
            <p>The solver was implemented as a single-file C program (<code>solver.c</code>, ~316 lines) with:</p>
            <ul>
                <li>A clean SipHash-2-4 implementation using <code>memcpy</code> for block reads (no alignment assumptions, correct on all platforms)</li>
                <li>Standard fallthrough switch for tail byte processing</li>
                <li>MurmurHash3 fmix64 for Layer 11 polynomial validation</li>
                <li>Sequential phase execution with early termination on failure</li>
                <li>Full validation of Layers 7, 8, 9, and 11 on the recovered candidate</li>
            </ul>
            <p>Compiled with:</p>
            <pre><code class="language-bash">gcc -O3 -march=native -o solver solver.c -Wno-implicit-fallthrough</code></pre>
            <p>The <code>-march=native</code> flag enables AVX2/BMI2 instruction selection, though the primary performance bottleneck is the tight SipHash loop which the compiler handles well at <code>-O3</code>.</p>

            <h2>9. Key Recovery</h2>

            <h3>9.1 Solver Execution</h3>
            <div class="bg-[#050505] p-4 rounded-xl border border-white/5 font-mono text-xs text-gray-400 overflow-x-auto">
                <div class="mb-2"><span class="text-blue-400">[Phase 1]</span> Digits 24-27  (10K)<br>  -> <span class="text-green-400">2026</span><br>  (0.00 s)</div>
                <div class="mb-2"><span class="text-blue-400">[Phase 2]</span> Seg4 pos 21-22  (1.3K)<br>  -> seg4 = <span class="text-green-400">3R_2026</span><br>  (0.00 s)</div>
                <div class="mb-2"><span class="text-blue-400">[Phase 3]</span> Seg2 pos 7-13  (2.2B)  [pos 10='_']<br>  -> seg2 = <span class="text-green-400">3U5_F1R</span><br>  (24.71 s)</div>
                <div class="mb-2"><span class="text-blue-400">[Phase 4]</span> Seg3 pos 14-20  (2.2B)  [pos 15='_']<br>  -> seg3 = <span class="text-green-400">3_ST34L</span><br>  (24.37 s)</div>
                <div class="mb-2"><span class="text-blue-400">[Phase 5]</span> Seg1 pos 0-6  (sum-constrained, target=494)<br>  -> seg1 = <span class="text-green-400">PR0M3TH</span><br>  (6.66 s)</div>
                <div class="border-t border-white/10 my-2 pt-2"></div>
                <div class="text-white font-bold">  CANDIDATE KEY: PR0M3TH3U5_F1R3_ST34L3R_2026</div>
                <div class="border-t border-white/10 my-2 pt-2"></div>
                <div>  ASCII sum  : 1901  <span class="text-green-400">PASS</span></div>
                <div>  Layer 7    : 3ba502e7231ce03e  <span class="text-green-400">PASS</span></div>
                <div>  Layer 8    : d0e9612ed3986da4  <span class="text-green-400">PASS</span></div>
                <div>  Layer 9    : 6eedaa1c6002baee  <span class="text-green-400">PASS</span></div>
                <div>  Layer 11   : polynomial  <span class="text-green-400">PASS</span></div>
                <br>
                <div class="text-green-400 font-bold">  OVERALL    : ALL PASS</div>
            </div>
            <p class="mt-4"><strong>Total solver runtime: 55.74 seconds</strong> on a single core.</p>

            <h3>9.2 Key Semantics</h3>
            <p>The recovered key in leetspeak:</p>
            <div class="flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-white/5 rounded-xl border border-white/5 my-6 w-full overflow-x-auto">
                <div class="text-sm sm:text-lg md:text-2xl lg:text-3xl font-mono font-bold text-white tracking-tight sm:tracking-wide md:tracking-widest text-center mb-2 break-all whitespace-normal">PR0M3TH3U5_F1R3_ST34L3R_2026</div>
                <i class="ph ph-arrow-down text-xl md:text-2xl text-text-muted mb-2"></i>
                <div class="text-xs sm:text-base md:text-xl lg:text-2xl font-mono text-green-400 tracking-tight sm:tracking-wide md:tracking-widest text-center break-all whitespace-normal">PROMETHEUS_FIRE_STEALER_2026</div>
            </div>
            <p>Prometheus, the Titan who stole fire from the gods and gave it to humanity. The "2026" suffix matches the challenge's publication year — and explains the "YEARHASH" key name in Layer 6.</p>

            <h3>9.3 Binary Validation</h3>
            <pre><code class="language-bash">$ echo 'PR0M3TH3U5_F1R3_ST34L3R_2026' | ./prometheus</code></pre>
            <pre><code class="language-text">Enter key:
[success banner]
Access Granted!
Contact @SoltaAndPepperk on telegram to claim prize and get job offer</code></pre>
            <p>Exit code 0. All 12 layers passed. Key confirmed.</p>

            <h2>10. Architectural Notes</h2>

            <h3>10.1 Defense-in-Depth Design</h3>
            <p>The 12-layer architecture is well-engineered for a CrackMe. The defenses are layered in a deliberate progression:</p>
            <ul>
                <li><strong>Layers 1–3 (anti-analysis):</strong> Prevent casual debugging. RDTSC + clock_gettime covers both cycle-level and wall-clock detection. Dual timing checks with different parameters resist single-patch bypasses.</li>
                <li><strong>Layer 4–6 (structural):</strong> Establish format constraints before expensive hash computations. This is computationally efficient — cheap checks first, expensive checks later.</li>
                <li><strong>Layers 7–9 (full-key hash triplet):</strong> Three independent SipHash checks with different keys provide 192 bits of joint constraint. A key that passes one check has a ~2^-128 probability of passing the other two by chance.</li>
                <li><strong>Layer 10 (segment decomposition):</strong> This is both a strength and the vulnerability. It enables independent verification of key segments (useful for partial-progress feedback in a legitimate scenario), but it also enables the divide-and-conquer attack that reduces the search space from 36^24 ≈ 2^124 to 4 × 36^6 ≈ 2^33.</li>
                <li><strong>Layer 11 (polynomial):</strong> An algebraic constraint orthogonal to the hash-based checks. Because fmix64 is a bijection, this effectively specifies 5 values of a degree-27 polynomial over Z/(2^64)Z.</li>
                <li><strong>Layer 12 (S-box/AES/PRNG):</strong> The final "integrity seal" that ties the key to the binary's own structure. Resists patching because modifying the binary changes the S-box or PRNG seed.</li>
            </ul>

            <h3>10.2 The Critical Weakness</h3>
            <p>Layer 10 is the single point of failure in the design. By hashing 7-byte segments independently, it reduces the effective key entropy from ~124 bits to four independent ~31-bit problems. Without Layer 10, the only feasible approach would be a meet-in-the-middle attack against the full-key hashes, which would require ~2^32 memory and ~2^64 computation — infeasible for a CrackMe.</p>
            <p>If the author had used 14-byte segments (two halves) instead of 7-byte segments, the per-segment search space would be 36^11 ≈ 2^57, which is at the edge of practical brute-force with consumer hardware. Using the full 28 bytes as a single SipHash input (as in Layers 7–9) with only the full-key checks would make the challenge mathematically unsolvable through brute-force.</p>
            <p>The author likely chose 7-byte segments intentionally to make the challenge solvable within reasonable compute time — this is a CrackMe, not a one-way function.</p>

            <h3>10.3 Rust as an Obfuscation Layer</h3>
            <p>The choice of Rust for a CrackMe introduces substantial analysis friction:</p>
            <ul>
                <li><strong>Monomorphization</strong> produces enormous function counts (1,600+ in this binary) — most are template instantiations of standard library generics that have nothing to do with the actual logic.</li>
                <li><strong>Static linking</strong> of the Rust stdlib means the analyst must distinguish ~1,570 library functions from ~30 challenge functions.</li>
                <li><strong>String formatting machinery</strong> (<code>core::fmt::*</code>) generates deeply nested call chains that look complex but are just print statements.</li>
                <li><strong>Option/Result unwrapping</strong> produces branching patterns (panic paths) that inflate the CFG without contributing to the logic.</li>
                <li><strong>Ownership/borrowing</strong> results in frequent stack copies and pointer indirection that obscure data flow in the decompiler.</li>
            </ul>
            <p>Despite these obstacles, the core verification logic — once identified — is clean and well-structured. The Rust surface noise is primarily a time tax on initial triage, not a fundamental barrier.</p>

            <h2>11. Summary of Verified Constants</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white/5 p-4 rounded-lg border border-white/5 text-xs font-mono">
                    <h4 class="text-white font-bold mb-2">Layer 6 — Digit Hash</h4>
                    Input:    key[24:28] (4 bytes)<br>
                    k0:       0x5945415248415348 ("YEARHASH")<br>
                    k1:       0x4b45593031303230 ("KEY01020")<br>
                    Expected: 0x61ffb66cadf3cecd
                </div>
                <div class="bg-white/5 p-4 rounded-lg border border-white/5 text-xs font-mono">
                    <h4 class="text-white font-bold mb-2">Layer 7 — Full-Key Hash #1</h4>
                    Input:    key[0:28] (28 bytes)<br>
                    k0:       0xdeadbeefcafebabe<br>
                    k1:       0x0123456789abcdef<br>
                    Expected: 0x3ba502e7231ce03e
                </div>
                <div class="bg-white/5 p-4 rounded-lg border border-white/5 text-xs font-mono">
                    <h4 class="text-white font-bold mb-2">Layer 10 — Segment Hashes</h4>
                    Seg1 [0:7]   exp=0x64ab81fecce00947<br>
                    Seg2 [7:14]  exp=0x3fbb8e4ae1100e16<br>
                    Seg3 [14:21] exp=0x878578dd58494be0<br>
                    Seg4 [21:28] exp=0x7d54d6c20d46d7ca
                </div>
                <div class="bg-white/5 p-4 rounded-lg border border-white/5 text-xs font-mono">
                    <h4 class="text-white font-bold mb-2">Structural Constants</h4>
                    Key length:      28<br>
                    ASCII sum:       1901 (0x76D)<br>
                    Underscore pos:  10, 15, 23<br>
                    Digit pos:       24, 25, 26, 27<br>
                    Charset:         [A-Z] ∪ [0-9] ∪ {_}
                </div>
            </div>

            <h2>12. Solver Source Code</h2>
            <p>The complete brute-force solver implementation in C. Compile with <code>gcc -O3 -march=native -o solver solver.c</code>:</p>
            
            <!-- Code Block with Copy Button -->
            <div class="relative group">
                <button onclick="copyCodeBlock(this, 'solver-code')" class="absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-2 text-xs font-bold font-mono bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/30 rounded-lg text-gray-300 hover:text-white transition-all duration-200 backdrop-blur-sm shadow-lg">
                    <i class="ph ph-copy text-base"></i>
                    <span>Copy</span>
                </button>
            <pre><code class="language-c" id="solver-code">/*
 * Prometheus CrackMe — Brute-Force Key Recovery Solver
 * =====================================================
 * Target: 28-char key  [A-Z0-9_], underscores at pos 10/15/23, digits at 24-27
 * Hash:   SipHash-2-4 (standard)
 * Strategy:
 *   Phase 1 — last 4 digits         (10^4 = 10K)
 *   Phase 2 — segment 4 pos 21-22   (36^2 = 1.3K)
 *   Phase 3 — segment 2 pos 7-13    (36^6 ≈ 2.2B)
 *   Phase 4 — segment 3 pos 14-20   (36^6 ≈ 2.2B)
 *   Phase 5 — segment 1 pos 0-6     (36^6 with sum constraint)
 *   Validate — full-key L7/L8/L9 + polynomial L11
 *
 * Compile: gcc -O3 -o solver solver.c
 */

#include &lt;stdio.h&gt;
#include &lt;stdlib.h&gt;
#include &lt;string.h&gt;
#include &lt;stdint.h&gt;
#include &lt;inttypes.h&gt;
#include &lt;time.h&gt;

/* ── SipHash-2-4 ──────────────────────────────────────────────── */

static inline uint64_t rotl64(uint64_t v, int n) {
    return (v &lt;&lt; n) | (v &gt;&gt; (64 - n));
}

#define SIPROUND do {                                       \\
    v0 += v1; v1 = rotl64(v1, 13); v1 ^= v0;              \\
    v0 = rotl64(v0, 32);                                   \\
    v2 += v3; v3 = rotl64(v3, 16); v3 ^= v2;              \\
    v0 += v3; v3 = rotl64(v3, 21); v3 ^= v0;              \\
    v2 += v1; v1 = rotl64(v1, 17); v1 ^= v2;              \\
    v2 = rotl64(v2, 32);                                   \\
} while (0)

static uint64_t siphash24(const uint8_t *data, size_t len,
                           uint64_t k0, uint64_t k1)
{
    uint64_t v0 = UINT64_C(0x736f6d6570736575) ^ k0;
    uint64_t v1 = UINT64_C(0x646f72616e646f6d) ^ k1;
    uint64_t v2 = UINT64_C(0x6c7967656e657261) ^ k0;
    uint64_t v3 = UINT64_C(0x7465646279746573) ^ k1;

    size_t blocks = len / 8;
    const uint8_t *p = data;

    for (size_t i = 0; i &lt; blocks; i++, p += 8) {
        uint64_t m;
        memcpy(&amp;m, p, 8);                       /* little-endian on x86 */
        v3 ^= m;
        SIPROUND; SIPROUND;
        v0 ^= m;
    }

    uint64_t m = (uint64_t)len &lt;&lt; 56;
    switch (len &amp; 7) {
        case 7: m |= (uint64_t)p[6] &lt;&lt; 48;  /* fall through */
        case 6: m |= (uint64_t)p[5] &lt;&lt; 40;  /* fall through */
        case 5: m |= (uint64_t)p[4] &lt;&lt; 32;  /* fall through */
        case 4: m |= (uint64_t)p[3] &lt;&lt; 24;  /* fall through */
        case 3: m |= (uint64_t)p[2] &lt;&lt; 16;  /* fall through */
        case 2: m |= (uint64_t)p[1] &lt;&lt;  8;  /* fall through */
        case 1: m |= (uint64_t)p[0];        /* fall through */
        case 0: break;
    }
    v3 ^= m;
    SIPROUND; SIPROUND;
    v0 ^= m;

    v2 ^= 0xff;
    SIPROUND; SIPROUND; SIPROUND; SIPROUND;

    return v0 ^ v1 ^ v2 ^ v3;
}

/* ── MurmurHash3 fmix64 (for Layer 11 polynomial check) ────── */

static inline uint64_t fmix64(uint64_t k) {
    k ^= k &gt;&gt; 33;
    k *= UINT64_C(0xff51afd7ed558ccd);
    k ^= k &gt;&gt; 33;
    k *= UINT64_C(0xc4ceb9fe1a85ec53);
    k ^= k &gt;&gt; 33;
    return k;
}

/* ── Constants ────────────────────────────────────────────────── */

static const char CHARSET[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
#define CS 36

/* Layer 6  — digits hash */
#define L6_K0  UINT64_C(0x5945415248415348)
#define L6_K1  UINT64_C(0x4b45593031303230)
#define L6_EXP UINT64_C(0x61ffb66cadf3cecd)

/* Layer 10 — segment hashes */
#define S1_K0  UINT64_C(0x1234567890abcdef)
#define S1_K1  UINT64_C(0xfedcba0987654321)
#define S1_EXP UINT64_C(0x64ab81fecce00947)

#define S2_K0  UINT64_C(0x23456789a1bcdf00)
#define S2_K1  UINT64_C(0xdcba97e7654320ff)
#define S2_EXP UINT64_C(0x3fbb8e4ae1100e16)

#define S3_K0  UINT64_C(0x3456789ab2cdf011)
#define S3_K1  UINT64_C(0xba9875c54320fedd)
#define S3_EXP UINT64_C(0x878578dd58494be0)

#define S4_K0  UINT64_C(0x456789abc3df0122)
#define S4_K1  UINT64_C(0x987653a320fedcbb)
#define S4_EXP UINT64_C(0x7d54d6c20d46d7ca)

/* Layer 7/8/9 — full-key hashes */
#define L7_K0  UINT64_C(0xdeadbeefcafebabe)
#define L7_K1  UINT64_C(0x0123456789abcdef)
#define L7_EXP UINT64_C(0x3ba502e7231ce03e)

#define L8_K0  UINT64_C(0xfedcba9876543210)
#define L8_K1  UINT64_C(0x1111111111111111)
#define L8_EXP UINT64_C(0xd0e9612ed3986da4)

#define L9_K0  UINT64_C(0xaaaaaaaaaaaaaaaa)
#define L9_K1  UINT64_C(0x5555555555555555)
#define L9_EXP UINT64_C(0x6eedaa1c6002baee)

/* Layer 11 — polynomial eval points &amp; expected fmix64 results */
static const uint64_t POLY_X[5]   = { 23, 43, 61, 79, 97 };
static const uint64_t POLY_EXP[5] = {
    UINT64_C(0x1c4bda1d97a28234),
    UINT64_C(0x4ccc43a8bca2aaa0),
    UINT64_C(0xb78b885d47924216),
    UINT64_C(0x6496916f31be02b1),
    UINT64_C(0xb50b9876a5566c31)
};

#define TARGET_SUM 1901

/* ── Helpers ──────────────────────────────────────────────────── */

static void print_elapsed(clock_t start) {
    double secs = (double)(clock() - start) / CLOCKS_PER_SEC;
    printf("  (%.2f s)\\n", secs);
}

static int validate_poly(const uint8_t *key) {
    for (int p = 0; p &lt; 5; p++) {
        uint64_t x   = POLY_X[p];
        uint64_t acc = 0, xpow = 1;
        for (int i = 0; i &lt; 28; i++) {
            acc  += (uint64_t)key[i] * xpow;
            xpow *= x;
        }
        if (fmix64(acc) != POLY_EXP[p]) return 0;
    }
    return 1;
}

/* ── Main ─────────────────────────────────────────────────────── */

int main(void)
{
    uint8_t key[32] = {0};          /* 28 used + padding */
    clock_t t0;

    /* Fixed structure */
    key[10] = '_';
    key[15] = '_';
    key[23] = '_';

    /* ─── Phase 1: last 4 digits (10K) ─────────────────────── */
    printf("[Phase 1] Digits 24-27  (10K)\\n");
    t0 = clock();
    int found1 = 0;
    for (int d0 = '0'; d0 &lt;= '9' &amp;&amp; !found1; d0++)
    for (int d1 = '0'; d1 &lt;= '9' &amp;&amp; !found1; d1++)
    for (int d2 = '0'; d2 &lt;= '9' &amp;&amp; !found1; d2++)
    for (int d3 = '0'; d3 &lt;= '9' &amp;&amp; !found1; d3++) {
        uint8_t buf[4] = { d0, d1, d2, d3 };
        if (siphash24(buf, 4, L6_K0, L6_K1) == L6_EXP) {
            key[24]=d0; key[25]=d1; key[26]=d2; key[27]=d3;
            printf("  -&gt; %c%c%c%c\\n", d0, d1, d2, d3);
            found1 = 1;
        }
    }
    print_elapsed(t0);
    if (!found1) { puts("FAIL: digits not found"); return 1; }

    /* ─── Phase 2: segment 4 positions 21-22 (1.3K) ───────── */
    printf("[Phase 2] Seg4 pos 21-22  (1.3K)\\n");
    t0 = clock();
    int found2 = 0;
    for (int a = 0; a &lt; CS &amp;&amp; !found2; a++)
    for (int b = 0; b &lt; CS &amp;&amp; !found2; b++) {
        key[21] = CHARSET[a];
        key[22] = CHARSET[b];
        if (siphash24(&amp;key[21], 7, S4_K0, S4_K1) == S4_EXP) {
            printf("  -&gt; seg4 = %.7s\\n", &amp;key[21]);
            found2 = 1;
        }
    }
    print_elapsed(t0);
    if (!found2) { puts("FAIL: seg4 not found"); return 1; }

    /* ─── Phase 3: segment 2 positions 7-13 (36^6 ≈ 2.2B) ── */
    printf("[Phase 3] Seg2 pos 7-13  (2.2B)  [pos 10='_']\\n");
    t0 = clock();
    int found3 = 0;
    for (int a = 0; a &lt; CS &amp;&amp; !found3; a++) { key[7] = CHARSET[a];
    for (int b = 0; b &lt; CS &amp;&amp; !found3; b++) { key[8] = CHARSET[b];
    for (int c = 0; c &lt; CS &amp;&amp; !found3; c++) { key[9] = CHARSET[c];
    for (int d = 0; d &lt; CS &amp;&amp; !found3; d++) { key[11]= CHARSET[d];
    for (int e = 0; e &lt; CS &amp;&amp; !found3; e++) { key[12]= CHARSET[e];
    for (int f = 0; f &lt; CS &amp;&amp; !found3; f++) { key[13]= CHARSET[f];
        if (siphash24(&amp;key[7], 7, S2_K0, S2_K1) == S2_EXP) {
            printf("  -&gt; seg2 = %.7s\\n", &amp;key[7]);
            found3 = 1;
        }
    }}}}}}
    print_elapsed(t0);
    if (!found3) { puts("FAIL: seg2 not found"); return 1; }

    /* ─── Phase 4: segment 3 positions 14-20 (36^6 ≈ 2.2B) ── */
    printf("[Phase 4] Seg3 pos 14-20  (2.2B)  [pos 15='_']\\n");
    t0 = clock();
    int found4 = 0;
    for (int a = 0; a &lt; CS &amp;&amp; !found4; a++) { key[14]= CHARSET[a];
    for (int b = 0; b &lt; CS &amp;&amp; !found4; b++) { key[16]= CHARSET[b];
    for (int c = 0; c &lt; CS &amp;&amp; !found4; c++) { key[17]= CHARSET[c];
    for (int d = 0; d &lt; CS &amp;&amp; !found4; d++) { key[18]= CHARSET[d];
    for (int e = 0; e &lt; CS &amp;&amp; !found4; e++) { key[19]= CHARSET[e];
    for (int f = 0; f &lt; CS &amp;&amp; !found4; f++) { key[20]= CHARSET[f];
        if (siphash24(&amp;key[14], 7, S3_K0, S3_K1) == S3_EXP) {
            printf("  -&gt; seg3 = %.7s\\n", &amp;key[14]);
            found4 = 1;
        }
    }}}}}}
    print_elapsed(t0);
    if (!found4) { puts("FAIL: seg3 not found"); return 1; }

    /* ─── Phase 5: segment 1 positions 0-6 (sum-constrained) ─ */
    int sum_rest = 0;
    for (int i = 7; i &lt; 28; i++) sum_rest += key[i];
    int need1 = TARGET_SUM - sum_rest;
    printf("[Phase 5] Seg1 pos 0-6  (sum-constrained, target=%d)\\n", need1);
    /* 7 chars each in [48..57]∪[65..90] → min=7×48=336 max=7×90=630 */
    if (need1 &lt; 336 || need1 &gt; 630) {
        printf("  ERROR: target sum %d out of range\\n", need1);
        return 1;
    }
    t0 = clock();
    int found5 = 0;
    for (int a = 0; a &lt; CS &amp;&amp; !found5; a++) { key[0] = CHARSET[a];
    for (int b = 0; b &lt; CS &amp;&amp; !found5; b++) { key[1] = CHARSET[b];
    for (int c = 0; c &lt; CS &amp;&amp; !found5; c++) { key[2] = CHARSET[c];
        int s3 = key[0]+key[1]+key[2];
        int r4 = need1 - s3;
        if (r4 &lt; 4*48 || r4 &gt; 4*90) continue;
    for (int d = 0; d &lt; CS &amp;&amp; !found5; d++) { key[3] = CHARSET[d];
    for (int e = 0; e &lt; CS &amp;&amp; !found5; e++) { key[4] = CHARSET[e];
        int s5 = s3 + key[3] + key[4];
        int r2 = need1 - s5;
        if (r2 &lt; 2*48 || r2 &gt; 2*90) continue;
    for (int f = 0; f &lt; CS &amp;&amp; !found5; f++) { key[5] = CHARSET[f];
        int last = need1 - s5 - key[5];
        if (last &lt; 48 || last &gt; 90) continue;
        if (!((last &gt;= 48 &amp;&amp; last &lt;= 57) || (last &gt;= 65 &amp;&amp; last &lt;= 90))) continue;
        key[6] = (uint8_t)last;
        if (siphash24(&amp;key[0], 7, S1_K0, S1_K1) == S1_EXP) {
            printf("  -&gt; seg1 = %.7s\\n", &amp;key[0]);
            found5 = 1;
        }
    }}}}}}
    print_elapsed(t0);
    if (!found5) { puts("FAIL: seg1 not found"); return 1; }

    /* ─── Validation ──────────────────────────────────────────── */
    printf("\\n========================================\\n");
    printf("  CANDIDATE KEY: %.28s\\n", key);
    printf("========================================\\n\\n");

    int pass = 1;
    uint64_t h;

    /* ASCII sum */
    int tsum = 0;
    for (int i = 0; i &lt; 28; i++) tsum += key[i];
    printf("  ASCII sum  : %d  %s\\n", tsum, tsum==TARGET_SUM?"PASS":"FAIL");
    if (tsum != TARGET_SUM) pass = 0;

    /* Full-key SipHash L7 */
    h = siphash24(key, 28, L7_K0, L7_K1);
    printf("  Layer 7    : %016" PRIx64 "  %s\\n", h, h==L7_EXP?"PASS":"FAIL");
    if (h != L7_EXP) pass = 0;

    /* Full-key SipHash L8 */
    h = siphash24(key, 28, L8_K0, L8_K1);
    printf("  Layer 8    : %016" PRIx64 "  %s\\n", h, h==L8_EXP?"PASS":"FAIL");
    if (h != L8_EXP) pass = 0;

    /* Full-key SipHash L9 */
    h = siphash24(key, 28, L9_K0, L9_K1);
    printf("  Layer 9    : %016" PRIx64 "  %s\\n", h, h==L9_EXP?"PASS":"FAIL");
    if (h != L9_EXP) pass = 0;

    /* Polynomial L11 */
    int poly_ok = validate_poly(key);
    printf("  Layer 11   : polynomial  %s\\n", poly_ok?"PASS":"FAIL");
    if (!poly_ok) pass = 0;

    printf("\\n  OVERALL    : %s\\n\\n", pass?"ALL PASS ✓":"SOME FAILED ✗");
    return pass ? 0 : 2;
}</code></pre>
            </div>

            <div class="mt-12 text-center">
                <p class="text-xl text-white font-bold mb-2">Key: <code class="text-green-400">PR0M3TH3U5_F1R3_ST34L3R_2026</code></p>
                <p class="text-text-muted italic">dr4gan — February 2026</p>
            </div>
        </div>
    `
});
