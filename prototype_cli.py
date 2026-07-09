from google import genai

# Thay bằng API Key của bạn
client = genai.Client(api_key="YOUR_GEMINI_API_KEY")

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Xin chào! Hãy giới thiệu bản thân trong 3 câu."
)

print(response.text)