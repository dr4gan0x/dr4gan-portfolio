/**
 * Dr4gan's Journal Configuration & Data
 */

window.Dr4ganData = window.Dr4ganData || {};
window.Dr4ganData.config = {
    issueNumber: "0x01",
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    author: {
        name: "dr4gan",
        bio: "Reverse Engineer & Low-Level Developer. Windows Kernel / System Security.",
        email: "drgan754@gmail.com",
        github: "https://github.com/dr4gan0x"
    },
    aboutMe: `
        <p>Hello! I am <strong>dr4gan</strong>.</p>
        <p>I specialize in <strong>Windows Kernel Exploitation</strong>, <strong>Reverse Engineering</strong>, and <strong>Game Cheat Development</strong>.</p>
        <p>This blog serves as a repository for my research, write-ups on CTFs, and analysis of various malware samples and protection mechanisms.</p>
        <br>
        <h3>Skills</h3>
        <ul>
            <li>C/C++ & Assembly (x86/x64/ARM)</li>
            <li>Kernel Driver Development</li>
            <li>Reverse Engineering (<strong>Binary Ninja</strong>, IDA Pro, x64dbg)</li>
            <li>Game Hacking & Anti-Cheat Analysis</li>
        </ul>
    `
};

/**
 * Posts Data
 * Posts are now loaded from content/posts/ directory for modularity.
 * Each post file should push to this array.
 * 
 * Schema:
 * {
 *   id: "slug",
 *   title: "Title",
 *   date: "MMM DD, YYYY",
 *   category: "Category",
 *   tags: ["tag1", "tag2"],
 *   description: "Summary...",
 *   image: "path/to/img or null",
 *   content: "HTML content"
 * }
 */
window.Dr4ganData.posts = [];
