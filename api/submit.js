module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    console.log('=== NEW TEST SUBMISSION ===');
    
    let testData;
    
    // Parse request body
    if (typeof req.body === 'string') {
      try {
        testData = JSON.parse(req.body);
      } catch (e) {
        console.error('JSON parse error:', e);
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON data'
        });
      }
    } else {
      testData = req.body;
    }

    // Validate required data
    if (!testData.studentName) {
      return res.status(400).json({
        success: false,
        error: 'Student name is required'
      });
    }

    console.log('Student:', testData.studentName);
    console.log('Time spent:', testData.timeSpent, 'seconds');
    console.log('Time left:', testData.timeLeft, 'seconds');
    console.log('Page leaves:', testData.leaveCount);

    // Calculate results
    const totalQuestions = testData.questions?.length || 0;
    let correctAnswers = 0;
    let unansweredQuestions = 0;

    testData.questions?.forEach((q, index) => {
      const isCorrect = q.selected !== undefined && q.selected === q.correct;
      const isUnanswered = q.selected === undefined;
      
      if (isCorrect) correctAnswers++;
      if (isUnanswered) unansweredQuestions++;
    });

    const wrongAnswers = totalQuestions - correctAnswers - unansweredQuestions;
    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

    // Format time
    const minutesSpent = Math.floor(testData.timeSpent / 60);
    const secondsSpent = testData.timeSpent % 60;
    const timeSpentFormatted = `${minutesSpent}m ${secondsSpent}s`;

    // Get environment variables
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    console.log('Environment check:');
    console.log('  TELEGRAM_BOT_TOKEN:', TELEGRAM_BOT_TOKEN ? 'SET' : 'NOT SET');
    console.log('  TELEGRAM_CHAT_ID:', TELEGRAM_CHAT_ID ? 'SET' : 'NOT SET');

    // Create detailed report
    let report = `🎓 *ENGLISH TEST SUBMISSION*\n\n`;
    report += `👤 *Student:* ${testData.studentName}\n`;
    report += `⏱️ *Time Spent:* ${timeSpentFormatted}\n`;
    report += `⏰ *Time Left:* ${Math.floor(testData.timeLeft / 60)}m ${testData.timeLeft % 60}s\n`;
    report += `📊 *Score:* ${correctAnswers}/${totalQuestions} (${score}%)\n`;
    report += `✅ *Correct:* ${correctAnswers}\n`;
    report += `❌ *Wrong:* ${wrongAnswers}\n`;
    report += `⏭️ *Unanswered:* ${unansweredQuestions}\n`;
    report += `🚪 *Page Leaves:* ${testData.leaveCount || 0}\n`;
    report += `📅 *Submitted:* ${new Date().toLocaleString()}\n\n`;

    report += `*DETAILED RESULTS:*\n`;
    report += `═══════════════════════════════\n\n`;

    // Add each question with analysis
    testData.questions.forEach((q, index) => {
      const isCorrect = q.selected !== undefined && q.selected === q.correct;
      const isUnanswered = q.selected === undefined;
      const selectedOption = q.selected !== undefined ? q.options[q.selected] : '*Not answered*';
      const correctOption = q.options[q.correct];
      
      let emoji = '❌';
      let status = 'Wrong';
      if (isCorrect) {
        emoji = '✅';
        status = 'Correct';
      }
      if (isUnanswered) {
        emoji = '⏭️';
        status = 'Unanswered';
      }
      
      report += `${emoji} *Question ${index + 1}:* ${q.question}\n`;
      report += `   *Student's Answer:* ${selectedOption}\n`;
      report += `   *Correct Answer:* ${correctOption}\n`;
      report += `   *Status:* ${status}\n\n`;
    });

    // Summary
    report += `═══════════════════════════════\n`;
    report += `*SUMMARY*\n`;
    report += `🏆 *Final Score:* ${score}%\n`;
    report += `📈 *Performance:* ${score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Average' : 'Needs Improvement'}\n`;

    console.log('Report generated, sending to Telegram...');

    // Send to Telegram
    let telegramSent = false;
    let telegramError = null;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        await sendTelegramMessage(report, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
        telegramSent = true;
        console.log('✅ Telegram message sent successfully');
      } catch (error) {
        telegramError = error.message;
        console.error('❌ Telegram error:', error.message);
      }
    } else {
      console.log('ℹ️ Telegram not configured');
    }

    // Log results
    console.log('📈 Final Score:', `${correctAnswers}/${totalQuestions} (${score}%)`);
    console.log('✅ Submission completed successfully');

    // Return success response
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

async function sendTelegramMessage(message, botToken, chatId) {
  // Split message if too long (Telegram limit: 4096 characters)
  if (message.length > 4000) {
    const part1 = message.substring(0, 4000) + '\n\n... (continued)';
    const part2 = '... (continued)\n\n' + message.substring(4000);
    
    await sendToTelegram(part1, botToken, chatId);
    // Wait a bit before sending second part
    await new Promise(resolve => setTimeout(resolve, 1000));
    await sendToTelegram(part2, botToken, chatId);
  } else {
    await sendToTelegram(message, botToken, chatId);
  }
}

async function sendToTelegram(text, botToken, chatId) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });

  const result = await response.json();
  
  if (!result.ok) {
    throw new Error(result.description || 'Telegram API error');
  }
  
  return result;
}
