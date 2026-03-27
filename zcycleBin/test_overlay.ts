import { setupChromeDriver } from './src/bots/core/browser_manager';
import { UniversalOverlay } from './src/bots/core/universal_overlay';

async function testOverlay() {
  console.log('🚀 Starting overlay test...');

  const { driver } = await setupChromeDriver('test');

  console.log('📱 Opening test page...');
  await driver.get('https://www.google.com');

  console.log('🎨 Creating overlay...');
  const overlay = new UniversalOverlay(driver);

  try {
    await overlay.showOverlay({
      title: '🚀 Improved Test Overlay',
      html: `
        <div style="line-height: 1.6;">
          <p><strong>✨ New Features:</strong></p>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>🔳 Larger card (400px width)</li>
            <li>🔵 Thicker border when collapsed (4px)</li>
            <li>➕ Perfectly centered + button</li>
            <li>🎨 Smooth drag animations</li>
            <li>📍 Position persistence</li>
          </ul>
          <p style="color: #00ffff;"><strong>Try dragging and collapsing me!</strong></p>
        </div>
      `,
      position: { x: 50, y: 50 },
      draggable: true,
      collapsible: true
    });

    console.log('✅ Overlay created successfully!');
    console.log('👀 Check the browser - you should see a draggable overlay');
    console.log('🔄 Waiting 10 seconds...');

    await driver.sleep(10000);

    console.log('🔄 Updating overlay content...');
    await overlay.updateOverlay({
      title: '🔄 Updated Overlay',
      html: `
        <div style="text-align: center;">
          <h3 style="color: #00ffff; margin: 0 0 15px 0;">Content Updated!</h3>
          <p>Notice how the position stayed the same?</p>
          <p style="margin: 15px 0;">Try collapsing to see the thick border circle!</p>
        </div>
      `
    });

    await driver.sleep(10000);

    console.log('🎯 Showing job progress...');
    await overlay.showJobProgress(3, 10, "Processing job applications", 7);

    await driver.sleep(5000);

    console.log('🔄 Updating progress...');
    await overlay.updateJobProgress(7, 10, "Almost done!", 9);

    await driver.sleep(5000);

    console.log('✅ Test completed!');

  } catch (error) {
    console.error('❌ Overlay test failed:', error);
  }

  console.log('Press Ctrl+C to exit');
}

testOverlay().catch(console.error);