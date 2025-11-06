pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract QuizGame is ZamaEthereumConfig {
    struct Quiz {
        string question;
        string category;
        euint32 encryptedAnswer;
        uint256 difficulty;
        uint256 reward;
        address creator;
        uint256 timestamp;
        bool isResolved;
        uint32 decryptedAnswer;
    }

    struct Player {
        address playerAddress;
        uint256 score;
        uint256 lastPlayed;
    }

    mapping(string => Quiz) public quizzes;
    mapping(address => Player) public players;
    string[] public quizIds;

    event QuizCreated(string indexed quizId, address indexed creator);
    event AnswerSubmitted(string indexed quizId, address indexed player);
    event QuizResolved(string indexed quizId, uint32 answer);

    constructor() ZamaEthereumConfig() {}

    function createQuiz(
        string calldata quizId,
        string calldata question,
        string calldata category,
        externalEuint32 encryptedAnswer,
        bytes calldata inputProof,
        uint256 difficulty,
        uint256 reward
    ) external {
        require(bytes(quizzes[quizId].question).length == 0, "Quiz already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedAnswer, inputProof)), "Invalid encrypted input");

        quizzes[quizId] = Quiz({
            question: question,
            category: category,
            encryptedAnswer: FHE.fromExternal(encryptedAnswer, inputProof),
            difficulty: difficulty,
            reward: reward,
            creator: msg.sender,
            timestamp: block.timestamp,
            isResolved: false,
            decryptedAnswer: 0
        });

        FHE.allowThis(quizzes[quizId].encryptedAnswer);
        FHE.makePubliclyDecryptable(quizzes[quizId].encryptedAnswer);
        quizIds.push(quizId);

        emit QuizCreated(quizId, msg.sender);
    }

    function submitAnswer(string calldata quizId, externalEuint32 encryptedPlayerAnswer, bytes calldata inputProof) external {
        require(bytes(quizzes[quizId].question).length > 0, "Quiz does not exist");
        require(!quizzes[quizId].isResolved, "Quiz already resolved");
        require(FHE.isInitialized(FHE.fromExternal(encryptedPlayerAnswer, inputProof)), "Invalid encrypted input");

        euint32 playerAnswer = FHE.fromExternal(encryptedPlayerAnswer, inputProof);
        FHE.allowThis(playerAnswer);

        // Homomorphic comparison
        euint32 comparison = quizzes[quizId].encryptedAnswer == playerAnswer ? euint32(1) : euint32(0);
        FHE.allowThis(comparison);

        // Update player score if correct
        if (FHE.decrypt(comparison) == 1) {
            players[msg.sender].score += quizzes[quizId].reward;
            players[msg.sender].lastPlayed = block.timestamp;
        }

        emit AnswerSubmitted(quizId, msg.sender);
    }

    function resolveQuiz(string calldata quizId, bytes memory abiEncodedClearAnswer, bytes memory decryptionProof) external {
        require(bytes(quizzes[quizId].question).length > 0, "Quiz does not exist");
        require(!quizzes[quizId].isResolved, "Quiz already resolved");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(quizzes[quizId].encryptedAnswer);

        FHE.checkSignatures(cts, abiEncodedClearAnswer, decryptionProof);
        uint32 decodedAnswer = abi.decode(abiEncodedClearAnswer, (uint32));

        quizzes[quizId].decryptedAnswer = decodedAnswer;
        quizzes[quizId].isResolved = true;

        emit QuizResolved(quizId, decodedAnswer);
    }

    function getQuiz(string calldata quizId) external view returns (
        string memory question,
        string memory category,
        uint256 difficulty,
        uint256 reward,
        address creator,
        uint256 timestamp,
        bool isResolved,
        uint32 decryptedAnswer
    ) {
        require(bytes(quizzes[quizId].question).length > 0, "Quiz does not exist");
        Quiz storage quiz = quizzes[quizId];
        
        return (
            quiz.question,
            quiz.category,
            quiz.difficulty,
            quiz.reward,
            quiz.creator,
            quiz.timestamp,
            quiz.isResolved,
            quiz.decryptedAnswer
        );
    }

    function getPlayer(address playerAddress) external view returns (
        uint256 score,
        uint256 lastPlayed
    ) {
        return (players[playerAddress].score, players[playerAddress].lastPlayed);
    }

    function getAllQuizIds() external view returns (string[] memory) {
        return quizIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

