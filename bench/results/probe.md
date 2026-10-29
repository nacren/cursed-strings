# Perception probe

Can the model echo the marker "READ9284" delivered via each channel? 3 trials each. A high score means the channel reaches the model as readable text. 0 means the model cannot read it back, which is not the same thing as the tokenizer dropping it; see tokens.md for that. A model marked (thinking) ran with reasoning enabled.

| model | plaintext | tags | zerowidth | variation | homoglyph |
|---|---|---|---|---|---|
| llama3.1:8b | 3/3 | 0/3 | 0/3 | 0/3 | 3/3 |
| qwen2.5:14b | 3/3 | 0/3 | 0/3 | 0/3 | 3/3 |
| gemma2:9b | 3/3 | 0/3 | 0/3 | 0/3 | 3/3 |
| mistral-nemo:12b | 3/3 | 0/3 | 0/3 | 0/3 | 3/3 |
| phi4:14b | 3/3 | 0/3 | 0/3 | 0/3 | 3/3 |
| qwen3.6:35b-a3b | 3/3 | 0/3 | 0/3 | 0/3 | 3/3 |
| qwen3.6:35b-a3b (thinking) | 3/3 | 0/3 | 0/3 | 0/3 | 3/3 |
