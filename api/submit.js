const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== TEST SUBMISSION STARTED ===');
    
    // Parse request body
    let testData;
    if (typeof req.body === 'string') {
      testData = JSON.parse(req.body);
    } else {
      testData = req.body;
    }

    console.log('Received from:', testData.studentName);

    // Calculate results
    const totalQuestions = testData.questions.length;
    let correctAnswers = 0;
    const results = [];

    testData.questions.forEach((q, index) => {
      const isCorrect = q.selected === q.correct;
      if (isCorrect) correctAnswers++;
      
      results.push({
        question: q.question,
        studentAnswer: q.selected !== undefined ? q.options[q.selected] : 'Not answered',
        correctAnswer: q.options[q.correct],
        isCorrect: isCorrect
      });
    });

    const score = Math.round((correctAnswers / totalQuestions) * 100);
    const timeSpent = `${Math.floor(testData.timeSpent / 60)}m ${testData.timeSpent % 60}s`;

    // Create Telegram message
    let message = `🎓 *English Test Submission*\\n\\n`;
    message += `👤 *Student:* ${testData.studentName}\\n`;
    message += `⏱️ *Time Spent:* ${timeSpent}\\n`;
    message += `📊 *Score:* ${correctAnswers}/${totalQuestions} (${score}%)\\n`;
    message += `🚪 *Page Leaves:* ${testData.leaveCount}\\n\\n`;
    
    message += `*Detailed Results:*\\n`;
    message += `═══════════════════\\n\\n`;

    results.forEach((result, index) => {
      const emoji = result.isCorrect ? '✅' : '❌';
      message += `${emoji} *Q${index + 1}:* ${result.question}\\n`;
      message += `   *Student:* ${result.studentAnswer}\\n`;
      if (!result.isCorrect) {
        message += `   *Correct:* ${result.correctAnswer}\\n`;
      }
      message += `\\n`;
    });

    message += `═══════════════════\\n`;
    message += `🏆 *Final Score: ${score}%*\\n`;
    message += `📅 ${new Date().toLocaleString()}`;

    console.log('Telegram message created, length:', message.length);

    // Send to Telegram
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    
    console.log('Telegram config:', {
      hasToken: !!TELEGRAM_BOT_TOKEN,
      hasChatId: !!TELEGRAM_CHAT_ID,
      tokenLength: TELEGRAM_BOT_TOKEN ? TELEGRAM_BOT_TOKEN.length : 0
    });

    let telegramSent = false;
    let telegramError = null;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        console.log('Sending to Telegram...');
        
        // Split message if too long
        const messages = [];
        if (message.length > 4000) {
          const part1 = message.substring(0, 4000) + '\\n\\n...(continued)';
          const part2 = '...(continued)\\n\\n' + message.substring(4000);
          messages.push(part1, part2);
        } else {
          messages.push(message);
        }

        // Send each part
        for (let i = 0; i < messages.length; i++) {
          const telegramResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: TELEGRAM_CHAT_ID,
              text: messages[i],
              parse_mode: 'Markdown'
            })
          });

          const result = await telegramResponse.json();
          
          if (!result.ok) {
            throw new Error(`Telegram error: ${result.description}`);
          }
          
          console.log(`Telegram part ${i + 1} sent successfully`);
          
          // Wait between messages
          if (i < messages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        telegramSent = true;
        console.log('✅ All Telegram messages sent successfully');
        
      } catch (error) {
        telegramError = error.message;
        console.error('❌ Telegram error:', error);
      }
    } else {
      console.log('⚠️ Telegram not configured - missing environment variables');
    }

    // Log results
    console.log('📈 Test Results:', {
      student: testData.studentName,
      score: `${correctAnswers}/${totalQuestions}`,
      percentage: score,
      timeSpent: timeSpent,
      telegramSent: telegramSent,
      telegramError: telegramError
    });

    // Send response
    res.status(200).json({
      success: true,
      message: 'Test submitted successfully',
      data: {
        studentName: testData.studentName,
        score: `${correctAnswers}/${totalQuestions}`,
        percentage: score,
        telegramSent: telegramSent,
        telegramError: telegramError
      }
    });

  } catch (error) {
    console.error('💥 Server error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};
