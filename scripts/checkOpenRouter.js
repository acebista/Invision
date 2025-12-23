const apiKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;

async function listModels() {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error("API Error:", response.status, await response.text());
            return;
        }

        const data = await response.json();
        console.log("Found", data.data.length, "models.");

        // Filter for Qwen models
        const qwenModels = data.data.filter(m => m.id.toLowerCase().includes('qwen'));

        console.log("\nAvailable Qwen Models:");
        qwenModels.forEach(m => {
            console.log(`- ${m.id}`);
            // console.log(`  Context: ${m.context_length}, Pricing: ${JSON.stringify(m.pricing)}`);
        });

    } catch (error) {
        console.error("Script error:", error);
    }
}

listModels();
