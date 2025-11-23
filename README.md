# QuizMaster: A Privacy-Preserving Quiz Game

QuizMaster is an innovative quiz game that harnesses the power of Zama's Fully Homomorphic Encryption (FHE) technology to ensure privacy and integrity in knowledge competitions. By encrypting answers and utilizing smart contracts for homomorphic grading, QuizMaster prevents cheating and plagiarism, making every quiz a fair and secure experience!

## The Problem

In traditional quiz formats, submission of answers in cleartext can expose sensitive information and allow for cheating. There are significant risks involved, such as answer manipulation and unauthorized access to participants' data. When data is transmitted without encryption, it becomes vulnerable to interception and misuse, compromising the integrity of the quiz environment and the privacy of participants.

## The Zama FHE Solution

QuizMaster addresses these challenges through the application of Zama's Fully Homomorphic Encryption technology. By enabling computation on encrypted data, we ensure that participant answers remain confidential throughout the grading process. Using fhevm to process encrypted inputs, we validate answers without ever revealing them in cleartext, achieving both security and privacy.

## Key Features

- 🎮 **Encrypted Answer Submission**: Players submit their answers in an encrypted format, safeguarding their responses from prying eyes.
- 🤖 **Automated Homomorphic Grading**: The game leverages smart contracts for instant grading, ensuring seamless and automated evaluation while maintaining confidentiality.
- 🏆 **Anti-Cheat Mechanism**: The system is designed to prevent cheating and plagiarism, ensuring fairness in competition.
- ❓ **Engaging Quiz Dynamics**: Interactive and compelling questions drive player engagement, making learning entertaining and rewarding.
- 🎖️ **Reward System**: Players earn medals and points based on their performance, enhancing motivation and participation.

## Technical Architecture & Stack

### Core Stack
- **Backend**: Using Zama's fhevm for homomorphic encryption processes.
- **Smart Contracts**: Implemented using Solidity for answer validation and grading.
- **Frontend**: Built with modern web technologies (React, TypeScript) for an engaging user interface.

### Privacy Engine
- **Zama's Technology**: The backbone of our privacy-preserving architecture is Zama's FHE technology, enabling secure operations on encrypted data without compromising participant privacy.

## Smart Contract / Core Logic

Here’s a simplified example of how the grading logic might be structured using Solidity:

```solidity
pragma solidity ^0.8.0;

contract QuizMaster {
    struct Question {
        bytes32 encryptedAnswer; // Store encrypted answers
        bool isCorrect;
    }
    
    mapping(uint256 => Question) public questions;
    uint256 public totalQuestions;
    
    function submitAnswer(uint256 questionId, bytes32 encryptedAnswer) public {
        // Logic to check the correctness of the encrypted answer
        if (checkAnswer(encryptedAnswer)) {
            questions[questionId].isCorrect = true;
        }
    }
    
    function checkAnswer(bytes32 encryptedAnswer) internal view returns (bool) {
        // Call to Zama's FHE library to perform decryption and comparison
        return TFHE.decrypt(encryptedAnswer) == questions[questionId].encryptedAnswer; 
    }
}
```

## Directory Structure

Here's how the project is organized:

```
QuizMaster/
|-- contracts/
|   |-- QuizMaster.sol
|-- src/
|   |-- components/
|   |-- App.tsx
|-- scripts/
|   |-- deploy.ts
|-- main.py
|-- package.json
|-- README.md
```

## Installation & Setup

To get started with QuizMaster, follow these steps:

### Prerequisites
1. Node.js (version >= 14.x)
2. Python (version >= 3.7)
3. A compatible web3 wallet (e.g., MetaMask)

### Install Dependencies
1. Clone the repository (method not specified).
2. Change directory to the project folder.
3. Install the necessary Node.js dependencies:
   ```bash
   npm install
   ```
4. Install the Zama FHE library:
   ```bash
   npm install fhevm
   ```
5. For Python dependencies:
   ```bash
   pip install concrete-ml
   ```

## Build & Run

Once the dependencies are installed, compile and run the project with the following commands:

1. **Compile Smart Contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Deploy Smart Contracts**:
   ```bash
   npx hardhat run scripts/deploy.ts
   ```

3. **Run the Application**:
   ```bash
   npm start
   ```

4. **Execute the Main Python Script** (for any backend processing):
   ```bash
   python main.py
   ```

## Acknowledgements

Special thanks to Zama for providing the open-source FHE primitives that empower QuizMaster. Their groundbreaking technology enables us to build secure applications while preserving user privacy, making QuizMaster not just a game, but a revolution in quiz competitions. 

Join us in transforming the way quizzes are conducted—playing securely and fairly, powered by Zama's advanced encryption technology!

