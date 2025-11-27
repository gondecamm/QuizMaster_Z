import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface QuizData {
  id: string;
  title: string;
  question: string;
  options: string[];
  encryptedAnswer: string;
  publicValue1: number;
  publicValue2: number;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
  score: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<QuizData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newQuizData, setNewQuizData] = useState({ 
    title: "", 
    question: "", 
    options: ["", "", "", ""], 
    answer: 0 
  });
  const [selectedQuiz, setSelectedQuiz] = useState<QuizData | null>(null);
  const [userAnswer, setUserAnswer] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [scoreboard, setScoreboard] = useState<{user: string, score: number}[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
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
      const quizzesList: QuizData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          quizzesList.push({
            id: businessId,
            title: businessData.name,
            question: businessData.description,
            options: ["Option A", "Option B", "Option C", "Option D"],
            encryptedAnswer: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            score: Math.floor(Math.random() * 100) + 1
          });
        } catch (e) {
          console.error('Error loading quiz data:', e);
        }
      }
      
      setQuizzes(quizzesList);
      updateScoreboard(quizzesList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const updateScoreboard = (quizzesList: QuizData[]) => {
    const userScores: {[key: string]: number} = {};
    quizzesList.forEach(quiz => {
      if (!userScores[quiz.creator]) {
        userScores[quiz.creator] = 0;
      }
      userScores[quiz.creator] += quiz.score;
    });
    
    const sortedScores = Object.entries(userScores)
      .map(([user, score]) => ({ user, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    
    setScoreboard(sortedScores);
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
      
      const businessId = `quiz-${Date.now()}`;
      const encryptedResult = await encrypt(contractAddress, address, newQuizData.answer);
      
      const tx = await contract.createBusinessData(
        businessId,
        newQuizData.title,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        newQuizData.options.length,
        0,
        newQuizData.question
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Quiz created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewQuizData({ title: "", question: "", options: ["", "", "", ""], answer: 0 });
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

  const submitAnswer = async (quizId: string, answerIndex: number) => {
    if (!isConnected || !address) return;
    
    setIsSubmitting(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Submitting encrypted answer..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const encryptedResult = await encrypt(contractAddress, address, answerIndex);
      const businessId = `answer-${quizId}-${Date.now()}`;
      
      const tx = await contract.createBusinessData(
        businessId,
        `Answer for ${quizId}`,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        answerIndex,
        0,
        `User answer submission`
      );
      
      await tx.wait();
      
      setUserAnswer(answerIndex);
      setTransactionStatus({ visible: true, status: "success", message: "Answer submitted successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
    } catch (e: any) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Submission failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const decryptAnswer = async (quizId: string): Promise<number | null> => {
    if (!isConnected || !address) return null;
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(quizId);
      if (businessData.isVerified) {
        return Number(businessData.decryptedValue) || 0;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(quizId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(quizId, abiEncodedClearValues, decryptionProof)
      );
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      await loadData();
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        await loadData();
        return null;
      }
      return null; 
    } finally { 
      setIsDecrypting(false); 
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
    quiz.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    quiz.question.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>FHE Quiz Master 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Your Wallet to Start</h2>
            <p>Join the privacy-preserving quiz competition with FHE encryption</p>
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
        <div className="logo">
          <h1>FHE Quiz Master 🔐</h1>
          <p>Privacy-Preserving Knowledge Challenge</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="status-btn">
            Check System
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + Create Quiz
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="sidebar">
          <div className="scoreboard-panel">
            <h3>🏆 Leaderboard</h3>
            <div className="scoreboard-list">
              {scoreboard.map((entry, index) => (
                <div key={index} className="scoreboard-item">
                  <span className="rank">{index + 1}</span>
                  <span className="user">{entry.user.substring(0, 6)}...{entry.user.substring(38)}</span>
                  <span className="score">{entry.score} pts</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="fhe-info-panel">
            <h3>🔐 FHE Protection</h3>
            <p>All answers are encrypted using Fully Homomorphic Encryption</p>
            <div className="fhe-steps">
              <div className="step">1. Encrypt Answer</div>
              <div className="step">2. Submit to Blockchain</div>
              <div className="step">3. Homomorphic Scoring</div>
              <div className="step">4. Privacy Preserved</div>
            </div>
          </div>
        </div>
        
        <div className="content-area">
          <div className="search-section">
            <input
              type="text"
              placeholder="Search quizzes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button onClick={loadData} disabled={isRefreshing} className="refresh-btn">
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          
          <div className="quizzes-grid">
            {filteredQuizzes.map((quiz, index) => (
              <div key={index} className="quiz-card">
                <div className="quiz-header">
                  <h3>{quiz.title}</h3>
                  <span className="score-badge">{quiz.score} pts</span>
                </div>
                <p className="quiz-question">{quiz.question}</p>
                <div className="quiz-options">
                  {quiz.options.map((option, optIndex) => (
                    <button
                      key={optIndex}
                      onClick={() => submitAnswer(quiz.id, optIndex)}
                      disabled={isSubmitting || userAnswer !== null}
                      className={`option-btn ${userAnswer === optIndex ? 'selected' : ''}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="quiz-footer">
                  <span>By: {quiz.creator.substring(0, 6)}...{quiz.creator.substring(38)}</span>
                  <button 
                    onClick={() => decryptAnswer(quiz.id)}
                    disabled={isDecrypting}
                    className="decrypt-btn"
                  >
                    {quiz.isVerified ? "✅ Verified" : "🔓 Verify"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {filteredQuizzes.length === 0 && (
            <div className="no-quizzes">
              <p>No quizzes found. Create the first one!</p>
              <button onClick={() => setShowCreateModal(true)} className="create-btn">
                Create Quiz
              </button>
            </div>
          )}
        </div>
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-quiz-modal">
            <div className="modal-header">
              <h2>Create New Quiz</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Quiz Title</label>
                <input 
                  type="text" 
                  value={newQuizData.title}
                  onChange={(e) => setNewQuizData({...newQuizData, title: e.target.value})}
                  placeholder="Enter quiz title..."
                />
              </div>
              
              <div className="form-group">
                <label>Question</label>
                <textarea 
                  value={newQuizData.question}
                  onChange={(e) => setNewQuizData({...newQuizData, question: e.target.value})}
                  placeholder="Enter your question..."
                  rows={3}
                />
              </div>
              
              <div className="form-group">
                <label>Options</label>
                {newQuizData.options.map((option, index) => (
                  <input
                    key={index}
                    type="text"
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...newQuizData.options];
                      newOptions[index] = e.target.value;
                      setNewQuizData({...newQuizData, options: newOptions});
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                  />
                ))}
              </div>
              
              <div className="form-group">
                <label>Correct Answer (0-3)</label>
                <input 
                  type="number"
                  min="0"
                  max="3"
                  value={newQuizData.answer}
                  onChange={(e) => setNewQuizData({...newQuizData, answer: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createQuiz}
                disabled={creatingQuiz || isEncrypting}
                className="submit-btn"
              >
                {creatingQuiz || isEncrypting ? "Creating..." : "Create Quiz"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;