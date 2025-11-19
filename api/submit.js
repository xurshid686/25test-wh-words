const telegramBot = require('node-telegram-bot-api');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const testData = req.body;
    
    // Validate required data
    if (!testData.studentName || !testData.answers) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    // Calculate results
    const results = calculateResults(testData);
    
    // Send to Telegram
    await sendToTelegram(results);
    
    // Return success response
    res.status(200).json({ 
      success: true, 
      message: 'Test submitted successfully',
      score: results.score,
      correctAnswers: results.correctCount
    });
    
  } catch (error) {
    console.error('Error processing submission:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error: ' + error.message 
    });
  }
};

function calculateResults(testData) {
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  const detailedResults = [];

  testData.questions.forEach((question, index) => {
    const studentAnswerIndex = testData.answers[index];
    const isCorrect = studentAnswerIndex === question.correct;
    const isAnswered = studentAnswerIndex !== undefined && studentAnswerIndex !== null;
    
    if (isAnswered) {
      if (isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
      }
    } else {
      unansweredCount++;
    }

    detailedResults.push({
      questionNumber: index + 1,
      question: question.question,
      studentAnswer: isAnswered ? question.options[studentAnswerIndex] : 'Not answered',
      correctAnswer: question.options[question.correct],
      status: !isAnswered ? 'Unanswered' : (isCorrect ? 'Correct' : 'Wrong'),
      isCorrect: isCorrect
    });
  });

  const totalQuestions = testData.questions.length;
  const score = Math.round((correctCount / totalQuestions) * 100);
  
  // Format time
  const timeSpentFormatted = formatTime(testData.timeSpent);
  const timeLeftFormatted = formatTime(testData.timeLeft);
  
  // Format submission date
  const submissionDate = new Date(testData.endTime).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return {
    studentName: testData.studentName,
    timeSpent: timeSpentFormatted,
    timeLeft: timeLeftFormatted,
    score: score,
    correctCount: correctCount,
    wrongCount: wrongCount,
    unansweredCount: unansweredCount,
    leaveCount: testData.leaveCount,
    submissionDate: submissionDate,
    totalQuestions: totalQuestions,
    detailedResults: detailedResults
  };
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

async function sendToTelegram(results) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn('Telegram credentials not found. Skipping Telegram notification.');
    return;
  }

  try {
    const bot = new telegramBot(botToken);
    
    // Create performance emoji
    let performanceEmoji = '📊';
    if (results.score >= 90) performanceEmoji = '🏆 Excellent';
    else if (results.score >= 80) performanceEmoji = '🎯 Very Good';
    else if (results.score >= 70) performanceEmoji = '👍 Good';
    else if (results.score >= 60) performanceEmoji = '📈 Average';
    else performanceEmoji = '📉 Needs Improvement';

    // Main report
    const mainReport = `🎓 ENGLISH TEST SUBMISSION

👤 Student: ${results.studentName}
⏱️ Time Spent: ${results.timeSpent}
⏰ Time Left: ${results.timeLeft}
📊 Score: ${results.correctCount}/${results.totalQuestions} (${results.score}%)
✅ Correct: ${results.correctCount}
❌ Wrong: ${results.wrongCount}
⏭️ Unanswered: ${results.unansweredCount}
🚪 Page Leaves: ${results.leaveCount}
📅 Submitted: ${results.submissionDate}

DETAILED RESULTS:
═══════════════════════════════
`;

    // Send main report first
    await bot.sendMessage(chatId, mainReport);

    // Send detailed results in chunks to avoid message length limits
    let detailedReport = '';
    
    results.detailedResults.forEach((result, index) => {
      const statusEmoji = result.status === 'Correct' ? '✅' : (result.status === 'Wrong' ? '❌' : '⏭️');
      const questionLine = `${statusEmoji} Question ${result.questionNumber}: ${result.question}\n   Student's Answer: ${result.studentAnswer}\n   Correct Answer: ${result.correctAnswer}\n   Status: ${result.status}\n\n`;
      
      // If adding this question would make the message too long, send current batch and start new one
      if (detailedReport.length + questionLine.length > 4000) {
        bot.sendMessage(chatId, detailedReport);
        detailedReport = questionLine;
      } else {
        detailedReport += questionLine;
      }
    });

    // Send any remaining detailed results
    if (detailedReport) {
      await bot.sendMessage(chatId, detailedReport);
    }

    // Send summary
    const summaryReport = `═══════════════════════════════
SUMMARY
🏆 Final Score: ${results.score}%
📈 Performance: ${performanceEmoji}`;

    await bot.sendMessage(chatId, summaryReport);

  } catch (error) {
    console.error('Error sending to Telegram:', error);
    throw new Error('Failed to send report to Telegram');
  }
}
