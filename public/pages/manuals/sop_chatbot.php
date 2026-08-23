<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'AI Chatbot ผู้ช่วยตอบคู่มือการซ่อมบำรุง 24 ชั่วโมง (Maintenance SOP Chatbot) - CMMS-TPT';
renderHeader();
?>

<div class="space-y-6 max-w-4xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-purple-800 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between flex-wrap gap-4 border border-purple-500/30">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-bold px-2.5 py-1 rounded-full uppercase">AI Maintenance Assistant</span>
                <span class="text-xs text-purple-200">24/7 SOP Troubleshooting Intelligence</span>
            </div>
            <h1 class="text-2xl font-black flex items-center gap-2">
                <i data-lucide="bot" class="w-7 h-7 text-purple-300"></i>
                <span>AI Chatbot ผู้ช่วยตอบคู่มือการซ่อมบำรุง 24 ชม. (Maintenance SOP Chatbot)</span>
            </h1>
            <p class="text-xs text-purple-100 mt-1">สอบถามวิธีแก้ไข Error Code, ขั้นตอนตามคู่มือ ISO SOP และข้อมูลทางเทคนิคเครื่องจักรได้ตลอด 24 ชั่วโมง</p>
        </div>
    </div>

    <!-- Chatbot Container Card -->
    <div class="card shadow-xl overflow-hidden flex flex-col h-[520px]">
        <!-- Chat Header -->
        <div class="bg-slate-900 text-white p-4 font-bold text-xs flex items-center justify-between border-b border-slate-800">
            <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>🤖 AI Maintenance Copilot (TOPPAN SOP Intelligence)</span>
            </div>
            <span class="text-[10px] text-muted font-mono">Knowledge Base v3.2</span>
        </div>

        <!-- Chat Messages Box -->
        <div id="chatBox" class="flex-1 p-4 overflow-y-auto space-y-3 bg-subtle text-xs font-medium">
            <!-- AI Welcome Message -->
            <div class="flex gap-2 max-w-lg">
                <div class="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-black shrink-0 text-xs">AI</div>
                <div class="card p-3.5 text-primary leading-relaxed">
                    สวัสดีครับผมคือ **AI ผู้ช่วยตอบคู่มือการซ่อมบำรุง (Maintenance SOP Chatbot)** 🤖<br><br>
                    สามารถสอบถามวิธีแก้ไข Error Code หรือขั้นตอนซ่อมได้เลยครับ เช่น:<br>
                    - *"วิธีแก้ไข Error Code E-402 มอเตอร์อุณหภูมิสูง"*<br>
                    - *"ขั้นตอนการเปลี่ยนเบียริ่ง Press Machine 01"*<br>
                    - *"คู่มือเช็คชีท PM ระบบลมและนิวแมติก"*
                </div>
            </div>
        </div>

        <!-- Chat Input Bar -->
        <form onsubmit="sendChat(event)" class="p-3 bg-white border-t border-line flex gap-2">
            <input type="text" id="chatInput" placeholder="พิมพ์ข้อความคำถามเกี่ยวกับคู่มือหรืออาการเสียของเครื่องจักร..." class="input input-bordered w-full text-xs flex-1 rounded-xl">
            <button type="submit" class="btn btn-primary bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-5 rounded-xl gap-2">
                <i data-lucide="send" class="w-4 h-4"></i>
                <span>ส่งคำถาม</span>
            </button>
        </form>
    </div>
</div>

<script>
function sendChat(e) {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    const txt = input.value.trim();
    if (!txt) return;

    const box = document.getElementById('chatBox');

    // Add User Bubble
    const uDiv = document.createElement('div');
    uDiv.className = 'flex gap-2 max-w-lg ml-auto justify-end';
    uDiv.innerHTML = `<div class="bg-purple-600 text-white p-3.5 rounded-2xl shadow-sm text-xs leading-relaxed">${escapeHtml(txt)}</div>`;
    box.appendChild(uDiv);

    input.value = '';
    box.scrollTop = box.scrollHeight;

    // Simulate AI Reply
    setTimeout(() => {
        const aiDiv = document.createElement('div');
        aiDiv.className = 'flex gap-2 max-w-lg';
        aiDiv.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-black shrink-0 text-xs">AI</div>
            <div class="card p-3.5 text-primary leading-relaxed">
                🔍 <strong>คำแนะนำการแก้ไขตามคู่มือ ISO SOP:</strong><br><br>
                สำหรับคำถาม <em>"${escapeHtml(txt)}"</em><br>
                1. ตรวจสอบระดับน้ำมันหล่อลื่นและแรงดันลมในระบบ<br>
                2. ทำความสะอาดฟิลเตอร์ดักฝุ่น และตรวจสอบสายไฟเข้ามอเตอร์<br>
                3. หากพบว่าอุณหภูมิเกิน 75°C ให้ทำการหยุดเครื่องและกดเปิดใบแจ้งซ่อม F-EN-03 ทันที
            </div>
        `;
        box.appendChild(aiDiv);
        box.scrollTop = box.scrollHeight;
    }, 600);
}

function escapeHtml(text) {
    return text.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}
</script>

<?php renderFooter(); ?>
