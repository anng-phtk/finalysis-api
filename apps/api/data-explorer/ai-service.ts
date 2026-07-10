
import fs from 'fs';
import path from 'path';

// Parse .env file manually at startup to inject environment variables
try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const index = trimmed.indexOf('=');
            if (index > 0) {
                const key = trimmed.slice(0, index).trim();
                const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
                process.env[key] = value;
            }
        }
    }
} catch (e) {
    console.error('Failed to load local .env file:', e);
}

export interface AiServiceClient {
    generate(prompt: string, attachments?: { name: string; content: string }[]): Promise<string>;
}

export class GeminiApiClient implements AiServiceClient {
    constructor(private readonly apiKey: string) {}

    async generate(prompt: string, attachments?: { name: string; content: string }[]): Promise<string> {
        let fullPrompt = prompt;
        if (attachments && attachments.length > 0) {
            fullPrompt = "The following attachments are provided as context:\n\n" + 
                attachments.map(a => `=== START ATTACHMENT: ${a.name} ===\n${a.content}\n=== END ATTACHMENT ===`).join('\n\n') +
                "\n\nUser Question/Instruction:\n" + prompt;
        }

        const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: fullPrompt }]
                }]
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Gemini API Error: ${res.status} ${res.statusText} - ${errText}`);
        }

        const data = (await res.json()) as any;
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            throw new Error("Gemini API returned an empty response.");
        }
        return text;
    }
}

export class GrokApiClient implements AiServiceClient {
    constructor(private readonly apiKey: string) {}

    async generate(prompt: string, attachments?: { name: string; content: string }[]): Promise<string> {
        let fullPrompt = prompt;
        if (attachments && attachments.length > 0) {
            fullPrompt = "The following attachments are provided as context:\n\n" + 
                attachments.map(a => `=== START ATTACHMENT: ${a.name} ===\n${a.content}\n=== END ATTACHMENT ===`).join('\n\n') +
                "\n\nUser Question/Instruction:\n" + prompt;
        }

        const model = process.env.GROK_MODEL || 'grok-beta';
        const url = 'https://api.x.ai/v1/chat/completions';

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: fullPrompt }]
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Grok API Error: ${res.status} ${res.statusText} - ${errText}`);
        }

        const data = (await res.json()) as any;
        const text = data?.choices?.[0]?.message?.content;
        if (!text) {
            throw new Error("Grok API returned an empty response.");
        }
        return text;
    }
}

export class LocalAiClient implements AiServiceClient {
    private readonly url: string;
    private readonly model: string;

    constructor() {
        this.url = process.env.LOCAL_AI_URL || 'http://localhost:11434/api/generate';
        this.model = process.env.LOCAL_AI_MODEL || 'llama3';
    }

    async generate(prompt: string, attachments?: { name: string; content: string }[]): Promise<string> {
        let fullPrompt = prompt;
        if (attachments && attachments.length > 0) {
            fullPrompt = "The following attachments are provided as context:\n\n" + 
                attachments.map(a => `=== START ATTACHMENT: ${a.name} ===\n${a.content}\n=== END ATTACHMENT ===`).join('\n\n') +
                "\n\nUser Question/Instruction:\n" + prompt;
        }

        const isOllamaGenerate = this.url.endsWith('/api/generate');

        const body = isOllamaGenerate
            ? { model: this.model, prompt: fullPrompt, stream: false }
            : { model: this.model, messages: [{ role: 'user', content: fullPrompt }] };

        const res = await fetch(this.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Local AI Error: ${res.status} ${res.statusText} - ${errText}`);
        }

        const data = (await res.json()) as any;
        const text = isOllamaGenerate 
            ? data?.response 
            : data?.choices?.[0]?.message?.content;

        if (!text) {
            throw new Error("Local AI returned an empty response.");
        }
        return text;
    }
}

export class NvidiaApiClient implements AiServiceClient {
    constructor(private readonly apiKey: string) {}

    async generate(prompt: string, attachments?: { name: string; content: string }[]): Promise<string> {
        let fullPrompt = prompt;
        if (attachments && attachments.length > 0) {
            fullPrompt = "The following attachments are provided as context:\n\n" + 
                attachments.map(a => `=== START ATTACHMENT: ${a.name} ===\n${a.content}\n=== END ATTACHMENT ===`).join('\n\n') +
                "\n\nUser Question/Instruction:\n" + prompt;
        }

        const model = process.env.NVIDIA_MODEL || 'google/diffusiongemma-26b-a4b-it';
        const url = 'https://integrate.api.nvidia.com/v1/chat/completions';

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: fullPrompt }],
                max_tokens: 4096,
                temperature: 1.00,
                top_p: 0.95,
                stream: false,
                chat_template_kwargs: { enable_thinking: true }
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`NVIDIA API Error: ${res.status} ${res.statusText} - ${errText}`);
        }

        const data = (await res.json()) as any;
        const text = data?.choices?.[0]?.message?.content;
        if (!text) {
            throw new Error("NVIDIA API returned an empty response.");
        }
        return text;
    }
}

export function getAiClient(): AiServiceClient {
    const provider = (process.env.AI_PROVIDER || 'local').toLowerCase().trim();

    if (provider === 'gemini') {
        const key = process.env.GEMINI_API_KEY;
        if (!key) throw new Error("GEMINI_API_KEY is not defined in environment variables.");
        return new GeminiApiClient(key);
    }

    if (provider === 'grok') {
        const key = process.env.GROK_API_KEY;
        if (!key) throw new Error("GROK_API_KEY is not defined in environment variables.");
        return new GrokApiClient(key);
    }

    if (provider === 'nvidia') {
        const key = process.env.NVIDIA_API_KEY;
        if (!key) throw new Error("NVIDIA_API_KEY is not defined in environment variables.");
        return new NvidiaApiClient(key);
    }

    return new LocalAiClient();
}
