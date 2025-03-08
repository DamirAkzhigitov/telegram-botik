# Project README

## Overview

This project is a Telegram bot built using the Telegraf framework that leverages OpenAI's GPT-4 API to simulate engaging conversations with users. The bot is designed to respond to user messages with AI-generated text, emojis, or reaction stickers based on the interpreted context of conversations.

## Features

- **AI-Powered Responses:** Utilizing OpenAI's GPT-4 API to generate human-like text responses based on the conversation history.
- **Session Management:** Maintains conversation history for users, allowing for contextually relevant replies by storing and retrieving the last 50 messages.
- **Multimedia Interaction:** Supports sending text responses, emojis, and reaction stickers to enhance user engagement.
- **Customizable Bot Behavior:** The bot can be adjusted to have different personalities or responses based on the defined parameters in the code.

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- A Telegram Bot Token (generated via the BotFather on Telegram)
- OpenAI API Key

### Getting Started

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/yourusername/your-repo-name.git
   cd your-repo-name
   ```

2. **Install Dependencies:**

   ```bash
   npm install
   ```

3. **Set Environment Variables:**
   Create a `.env` file in the root of the project and provide the necessary environment variables:

   ```plaintext
   API_KEY=your_openai_api_key
   BOT_KEY=your_telegram_bot_token
   CHAT_SESSIONS_STORAGE=your_storage_service
   ```

4. **Run the Bot:**
   To start the bot, use:
   ```bash
   npm run start
   ```

## Code Structure

- **`src/`**: Contains the main source code of the bot.
  - **`bot.ts`**: Logic for handling messages, maintaining sessions, and interacting with OpenAI.
  - **`gpt.ts`**: Handles the interaction with the OpenAI API and the custom prompt setup.
  - **`index.ts`**: Entry point for the application, handling requests from Telegram.
  - **`types.ts`**: Defines TypeScript interfaces for data structures used in the bot.
  - **`utils.ts`**: Contains utility functions for delays, AI response generation, and sticker interaction.

## How It Works

1. **Message Reception**: The bot listens for incoming messages through a webhook.
2. **Session Management**: For each chat, the bot retrieves the conversation history and maintains up to the last 50 messages for context. The session data is stored in a defined storage solution.
3. **AI Communication**: When a user sends a message, the bot constructs a prompt including the user's recent messages and the new message to request a response from OpenAI's API.
4. **Response Handling**: The bot receives a structured response from the API, which can include text, emojis, and reactions, and replies back to the user accordingly.

## Contributing

If you would like to contribute to this project, please fork the repository and create a pull request with detailed changes. Ensure that you adhere to the coding standards and write tests for any new features.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **OpenAI**: For providing the GPT-4 API.
- **Telegraf**: For simplifying the interaction with the Telegram Bot API.

## Future Improvements

- Integration with a more robust storage solution for persistent chat history.
- Implementing user authentication for more personalized responses.
- Adding an analytics dashboard to monitor user interaction with the bot.
