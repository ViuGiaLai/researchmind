from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:20128/v1",
    api_key="api_key",
)

response = client.chat.completions.create(
    model="oc/deepseek-v4-flash-free",  # thay bằng model có từ /v1/models
    messages=[
        {"role": "user", "content": "Xin chào, hãy trả lời ngắn gọn."}
    ],
    temperature=0.2,
)

print(response.choices[0].message.content)