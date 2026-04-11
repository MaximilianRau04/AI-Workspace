import google.generativeai as genai
import sys
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    print("❌ Error: GEMINI_API_KEY was not found.")
    print("Please make sure you have a .env file with GEMINI_API_KEY=your_key_here.")
    sys.exit(1)

genai.configure(api_key=API_KEY)

try:
    model = genai.GenerativeModel('gemini-2.5-flash')
except Exception as e:
    print(f"❌ Error while loading the model: {e}")
    sys.exit(1)

chat = model.start_chat(history=[])

print("🤖 Hello! I am your chatbot. (Type 'end' to exit the chat)")
print("-" * 60)

while True:
    user_input = input("You: ")

    if user_input.lower() in ['end', 'exit', 'quit']:
        print("🤖 Bot: Goodbye! See you next time.")
        break
    
    if not user_input.strip():
        continue

    try:
        response = chat.send_message(user_input)
        print(f"🤖 Bot: {response.text}")
        print("-" * 60)
        
    except Exception as e:
        print(f"❌ An error occurred: {e}")