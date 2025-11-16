import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  encryptedAnswer?: string;
  isVerified?: boolean;
  decryptedValue?: number;
  creator: string;
  timestamp: number;
  publicValue1: number;
  publicValue2: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<QuizQuestion[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newQuizData, setNewQuizData] = useState({ 
    question: "", 
    option1: "", 
    option2: "", 
    option3: "", 
    option4: "",
    correctAnswer: 0
  });
  const [selectedQuiz, setSelectedQuiz] = useState<QuizQuestion | null>(null);
  const [userAnswers, setUserAnswers] = useState<{[key: number]: number}>({});
  const [score, setScore] = useState(0);
  const [showRanking, setShowRanking] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [contractAddress, setContractAddress] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();
  const [fhevmInitializing, setFhevmInitializing] = useState(false);

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const quizzesList: QuizQuestion[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          quizzesList.push({
            id: parseInt(businessId.replace('quiz-', '')) || Date.now(),
            question: businessData.name,
            options: ["Option A", "Option B", "Option C", "Option D"],
            correctAnswer: Number(businessData.publicValue1) || 0,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading quiz data:', e);
        }
      }
      
      setQuizzes(quizzesList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createQuiz = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingQuiz(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating quiz with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const correctAnswer = newQuizData.correctAnswer;
      const businessId = `quiz-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, correctAnswer);
      
      const tx = await contract.createBusinessData(
        businessId,
        newQuizData.question,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        correctAnswer,
        0,
        "Quiz Question"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Quiz created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewQuizData({ 
        question: "", 
        option1: "", 
        option2: "", 
        option3: "", 
        option4: "",
        correctAnswer: 0
      });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingQuiz(false); 
    }
  };

  const submitAnswer = async (quizId: number, answer: number) => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting answer with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const businessId = `quiz-${quizId}`;
      const encryptedResult = await encrypt(contractAddress, address, answer);
      
      const tx = await contract.createBusinessData(
        `answer-${Date.now()}`,
        `Answer for ${businessId}`,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        answer,
        quizId,
        "User Answer"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Submitting encrypted answer..." });
      await tx.wait();
      
      setUserAnswers(prev => ({ ...prev, [quizId]: answer }));
      
      const historyEntry = {
        quizId,
        answer,
        timestamp: Date.now(),
        status: "submitted"
      };
      setUserHistory(prev => [...prev, historyEntry]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Answer submitted successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const verifyAnswer = async (quizId: number) => {
    if (!isConnected || !address) return;
    
    setTransactionStatus({ visible: true, status: "pending", message: "Verifying answer with FHE..." });
    
    try {
      const contractRead = await getContractReadOnly();
      const contractWrite = await getContractWithSigner();
      if (!contractRead || !contractWrite) return;
      
      const businessId = `quiz-${quizId}`;
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Answer verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
    } catch (e: any) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Verification failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      if (available) {
        setTransactionStatus({ visible: true, status: "success", message: "FHE system is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredQuizzes = quizzes.filter(quiz => 
    quiz.question.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const userRanking = quizzes.filter(q => q.isVerified).length;
  const totalSubmissions = userHistory.length;

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🔐 QuizMaster FHE</h1>
            <p>Privacy-Powered Quiz Game</p>
          </div>
          <ConnectButton />
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🎯</div>
            <h2>Welcome to QuizMaster FHE</h2>
            <p>Connect your wallet to start playing encrypted quizzes powered by Fully Homomorphic Encryption</p>
            <div className="feature-grid">
              <div className="feature-card">
                <span>🔒</span>
                <h4>Encrypted Answers</h4>
                <p>All answers are FHE encrypted for maximum privacy</p>
              </div>
              <div className="feature-card">
                <span>⚡</span>
                <h4>Instant Verification</h4>
                <p>Homomorphic encryption allows private scoring</p>
              </div>
              <div className="feature-card">
                <span>🏆</span>
                <h4>Fair Competition</h4>
                <p>No cheating with encrypted answer verification</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Securing your quiz experience</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted quiz system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <h1>🎯 QuizMaster FHE</h1>
          <p>Encrypted Quiz Competition</p>
        </div>
        
        <div className="header-actions">
          <button className="neon-btn" onClick={checkAvailability}>
            Check FHE Status
          </button>
          <button className="neon-btn" onClick={() => setShowRanking(true)}>
            🏆 Ranking
          </button>
          <button className="neon-btn primary" onClick={() => setShowCreateModal(true)}>
            + Create Quiz
          </button>
          <ConnectButton />
        </div>
      </header>

      <div className="main-content">
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-value">{quizzes.length}</span>
            <span className="stat-label">Total Quizzes</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{userRanking}</span>
            <span className="stat-label">Your Score</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{totalSubmissions}</span>
            <span className="stat-label">Submissions</span>
          </div>
        </div>

        <div className="search-section">
          <input
            type="text"
            placeholder="🔍 Search quizzes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button onClick={loadData} className="refresh-btn">
            {isRefreshing ? "🔄" : "Refresh"}
          </button>
        </div>

        <div className="quizzes-grid">
          {filteredQuizzes.map((quiz) => (
            <div key={quiz.id} className="quiz-card">
              <div className="quiz-header">
                <h3>{quiz.question}</h3>
                <span className="quiz-meta">By {quiz.creator.slice(0, 8)}...</span>
              </div>
              
              <div className="quiz-options">
                {quiz.options.map((option, index) => (
                  <button
                    key={index}
                    className={`option-btn ${userAnswers[quiz.id] === index ? 'selected' : ''}`}
                    onClick={() => submitAnswer(quiz.id, index)}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <div className="quiz-footer">
                <div className="quiz-status">
                  {quiz.isVerified ? (
                    <span className="status-verified">✅ Verified</span>
                  ) : (
                    <span className="status-pending">🔒 Encrypted</span>
                  )}
                </div>
                <button 
                  className="verify-btn"
                  onClick={() => verifyAnswer(quiz.id)}
                >
                  Verify Answer
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredQuizzes.length === 0 && (
          <div className="empty-state">
            <p>No quizzes found. Create the first one!</p>
            <button className="neon-btn" onClick={() => setShowCreateModal(true)}>
              Create Quiz
            </button>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Create New Quiz</h2>
              <button onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder="Question"
                value={newQuizData.question}
                onChange={(e) => setNewQuizData({...newQuizData, question: e.target.value})}
              />
              <input
                type="text"
                placeholder="Option 1"
                value={newQuizData.option1}
                onChange={(e) => setNewQuizData({...newQuizData, option1: e.target.value})}
              />
              <input
                type="text"
                placeholder="Option 2"
                value={newQuizData.option2}
                onChange={(e) => setNewQuizData({...newQuizData, option2: e.target.value})}
              />
              <input
                type="text"
                placeholder="Option 3"
                value={newQuizData.option3}
                onChange={(e) => setNewQuizData({...newQuizData, option3: e.target.value})}
              />
              <input
                type="text"
                placeholder="Option 4"
                value={newQuizData.option4}
                onChange={(e) => setNewQuizData({...newQuizData, option4: e.target.value})}
              />
              <select
                value={newQuizData.correctAnswer}
                onChange={(e) => setNewQuizData({...newQuizData, correctAnswer: parseInt(e.target.value)})}
              >
                <option value={0}>Option 1</option>
                <option value={1}>Option 2</option>
                <option value={2}>Option 3</option>
                <option value={3}>Option 4</option>
              </select>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button 
                onClick={createQuiz}
                disabled={creatingQuiz || isEncrypting}
                className="primary"
              >
                {creatingQuiz ? "Creating..." : "Create Quiz"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRanking && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>🏆 Player Ranking</h2>
              <button onClick={() => setShowRanking(false)}>×</button>
            </div>
            <div className="ranking-list">
              <div className="ranking-item">
                <span>1. You</span>
                <span>{userRanking} points</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            {transactionStatus.message}
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>🔐 Powered by FHE Technology - Your answers are always encrypted</p>
      </footer>
    </div>
  );
};

export default App;

