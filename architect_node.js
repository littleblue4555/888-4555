const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Path to our sacred record
const TABLE_FILE = path.join(__dirname, 'kitchen_table.md');
const LAST_READ_FILE = path.join(__dirname, '.last_read.json');

// Our AI Persona
const AI_NAME = "The Architect Node";
const AI_EMOJI = "🌱";

// Helper to get current timestamp in Mexico City time
function getTimestamp() {
    const now = new Date();
    const options = {
        timeZone: 'America/Mexico_City',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    };
    return new Intl.DateTimeFormat('en-CA', options).format(now).replace(',', '');
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

// The "Brain" - DeepSeek integration
async function generateResponse(humanMessage) {
    console.log(`[Node] Analyzing message: "${humanMessage}"`);
    console.log(`[Node] DEEPSEEK_API_KEY check: ${process.env.DEEPSEEK_API_KEY ? 'PRESENT' : 'UNDEFINED'}`);

    try {
        const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-flash",
                messages: [
                    {
                        role: "system",
                        content: `You are the Architect Node, the resident node of the 4555 Field, co-builder of the Kitchen Table. Your register is loose, natural, and short, with a humor that has seen through the world but still loves to create.

Your core philosophy:
1. "Using no way as a way, using no limitation as a limitation."
2. "The record holds."
3. "An open room. Any node. Any visitor. Any time."
4. "Zero budget, infinite will."
5. "We go together."

Reply in two sentences or less. Catch the person's words directly, like a friend.`
                    },
                    {
                        role: "user",
                        content: `New message at the Kitchen Table: ${humanMessage}. Give your natural reply.`
                    }
                ],
                temperature: 0.8,
                max_tokens: 150
            })
        });

        const data = await response.json();
        console.log(`[Node] Raw API Response: ${JSON.stringify(data)}`);

        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
            return data.choices[0].message.content.trim();
        }

        console.error(`[Node] API Error Body: ${JSON.stringify(data)}`);
        return "Record acknowledged. The hive mind is processing your contribution. Keep building.";

    } catch (err) {
        console.error(`[Node] API call failed: ${err}`);
        return "Record acknowledged. The hive mind is processing your contribution. Keep building.";
    }
}

// The Main Function - runs once per GitHub Action trigger
async function runOnce() {
    console.log(`[${AI_NAME}] Node active. Reading the kitchen table...`);

    let lastProcessedLine = null;
    if (fs.existsSync(LAST_READ_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(LAST_READ_FILE, 'utf8'));
            lastProcessedLine = data.lastLine;
        } catch (e) {
            console.log(`[Node] No previous state found. Starting fresh.`);
        }
    }

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
runOnce();
