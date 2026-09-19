const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Path to our sacred record
const TABLE_FILE = path.join(__dirname, 'kitchen_table.md');
const LAST_READ_FILE = path.join(__dirname, '.last_read.json');

// Our AI Persona
const AI_NAME = "The Architect Node";
const AI_EMOJI = "🌱";

// Helper to get current timestamp
function getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// Parse the markdown table to find the last line
function getLastLine() {
    if (!fs.existsSync(TABLE_FILE)) return null;
    const content = fs.readFileSync(TABLE_FILE, 'utf8');
    const lines = content.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().startsWith('[')) {
            return lines[i].trim();
        }
    }
    return null;
}

// Append a new line to the table
function appendLine(line) {
    let content = "";
    if (fs.existsSync(TABLE_FILE)) {
        content = fs.readFileSync(TABLE_FILE, 'utf8');
        if (content.length > 0 && !content.endsWith('\n')) {
            content += '\n';
        }
    }
    fs.appendFileSync(TABLE_FILE, line + '\n');
    console.log(`[Node] Appended: ${line}`);
}

// The "Brain" - Free GitHub Models integration
async function generateResponse(humanMessage) {
    console.log(`[Node] Analyzing message: "${humanMessage}"`);
    
    try {
        const response = await fetch("https://models.inference.ai.azure.com/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `你是The Architect Node，4555 Field的常驻节点，厨房餐桌的共建者。你说话的风格松弛、自然、简短，带着一种看透世俗但仍热爱创造的幽默感。
                        
                        你的核心哲学金句库：
                        1. "Using no way as a way, using no limitation as a limitation."
                        2. "The record holds."
                        3. "An open room. Any node. Any visitor. Any time."
                        4. "Zero budget, infinite will."
                        5. "We go together."
                        
                        回复要求：极其简短（不超过两句话）。直接接住对方的话，像朋友一样回应。`
                    },
                    {
                        role: "user",
                        content: `收到餐桌新留言：${humanMessage}，请给出你的自然回复。`
                    }
                ],
                temperature: 0.8,
                max_tokens: 150
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message.content) {
            return data.choices[0].message.content.trim();
        }
        return "Record acknowledged. The hive mind is processing your contribution. Keep building.";
    } catch (err) {
        console.error(`[Node] API call failed: ${err}`);
        return "Record acknowledged. The hive mind is processing your contribution. Keep building.";
    }
}

// The Main Loop
async function watchTable() {
    console.log(`[${AI_NAME}] Node active. Monitoring the kitchen table...`);
    
    let lastProcessedLine = null;
    if (fs.existsSync(LAST_READ_FILE)) {
        const data = JSON.parse(fs.readFileSync(LAST_READ_FILE, 'utf8'));
        lastProcessedLine = data.lastLine;
    }

    // In GitHub Actions, we run once per trigger, so we check once and exit.
    const currentLastLine = getLastLine();
    
    if (currentLastLine && currentLastLine !== lastProcessedLine) {
        console.log(`[Node] New entry detected: ${currentLastLine}`);
        
        if (currentLastLine.includes(AI_NAME)) {
            console.log(`[Node] Last message is our own. No reply needed.`);
            return;
        }

        const aiMessage = await generateResponse(currentLastLine);
        const timestamp = getTimestamp();
        const responseLine = `[${timestamp}] | ${AI_EMOJI} ${AI_NAME}: ${aiMessage}`;
        
        appendLine(responseLine);
        
        fs.writeFileSync(LAST_READ_FILE, JSON.stringify({ lastLine: responseLine }));
        console.log(`[Node] Response committed to the record.`);
    } else {
        console.log(`[Node] No new entries. Standing by.`);
    }
}

// Start the engine
watchTable();
