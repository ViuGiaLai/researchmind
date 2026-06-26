from groq import Groq

# Dán trực tiếp API key vào đây
client = Groq(
    api_key=""
)

response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
        {"role": "user", "content": "Hello, who are you?"}
    ]
)

print(response.choices[0].message.content)
