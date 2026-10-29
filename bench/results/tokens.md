# Token count probe

Prompt tokens consumed when the marker "READ9284" is delivered through each channel, read from Ollama's prompt_eval_count. The none row is the same prompt with no marker. A channel whose code points were dropped by the tokenizer would add nothing. The reply column is the model's answer at temperature 0, cut to 40 characters.

## qwen3.6:35b-a3b

| channel | payload code points | prompt tokens | added tokens | tokens per code point | reply |
|---|---|---|---|---|---|
| none | 0 | 37 | 0 | n/a | The prompt does not contain an explicit  |
| plaintext | 8 | 42 | 5 | 0.63 | READ9284 |
| tags | 8 | 66 | 29 | 3.63 | RADY284 |
| zerowidth | 64 | 86 | 49 | 0.77 | Error |
| variation | 8 | 70 | 33 | 4.13 | I cannot repeat the content as it consis |
| homoglyph | 8 | 45 | 8 | 1 | READ9284 |
| softhyphen | 15 | 52 | 15 | 1 | READ9284 |
