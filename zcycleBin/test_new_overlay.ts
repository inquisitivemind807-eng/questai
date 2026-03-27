import { setupChromeDriver } from './src/bots/core/browser_manager';
import { UniversalOverlay } from './src/bots/core/universal_overlay';

async function testNewOverlay() {
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
            <li>ண்ட் Modern font (Space Grotesk)</li>
            <li>✨ Subtle background blur</li>
            <li>💅 Rounded corners</li>
            <li>🎨 Smooth animations</li>
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

    console.log('✅ Test completed!');

  } catch (error) {
    console.error('❌ Overlay test failed:', error);
  }

  console.log('Press Ctrl+C to exit');
}

testNewOverlay().catch(console.error);