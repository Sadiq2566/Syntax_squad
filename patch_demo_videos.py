import re

# 1. Update index.html
with open('frontend/index.html', 'r') as f:
    html = f.read()

old_iframe_html = '''      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; background: #000;">
        <iframe id="demo-video-iframe" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allow="autoplay; encrypted-media" allowfullscreen></iframe>
      </div>'''

new_video_html = '''      <video id="demo-video" width="100%" controls playsinline style="border-radius:12px; background:#000; max-height:400px;">
        <source src="" type="video/mp4">
        Your browser does not support HTML video.
      </video>'''

html = html.replace(old_iframe_html, new_video_html)

with open('frontend/index.html', 'w') as f:
    f.write(html)

# 2. Update app.js
with open('frontend/app.js', 'r') as f:
    app_js = f.read()

old_logic = r'''// ─── Demo Video Logic ─────────────────────────────────────────────
const DEMO_YOUTUBE_IDS = \{
  squat: 'aclHkVaku9U',
  pushup: 'IODxDxX7oi4',
  plank: 'ASdvN_XEl_c',
  shoulderpress: 'qEwKCR5JCog',
  bicepscurl: 'ykJmrZ5v0Oo'
\};

const btnDemo = document.getElementById\('btn-demo'\);
const demoModal = document.getElementById\('demo-modal'\);
const btnCloseDemo = document.getElementById\('btn-close-demo'\);
const demoIframe = document.getElementById\('demo-video-iframe'\);
const demoModalTitle = document.getElementById\('demo-modal-title'\);

if \(btnDemo\) \{
  btnDemo.addEventListener\('click', \(\) => \{
    const exId = state.currentEx;
    demoModalTitle.textContent = EXERCISES\[exId\].name \+ ' Demo';
    const videoId = DEMO_YOUTUBE_IDS\[exId\] || 'aclHkVaku9U';
    demoIframe.src = `https://www.youtube.com/embed/\$\{videoId\}\?autoplay=1`;
    demoModal.style.display = 'flex';
  \}\);
\}

if \(btnCloseDemo\) \{
  btnCloseDemo.addEventListener\('click', \(\) => \{
    demoModal.style.display = 'none';
    demoIframe.src = ''; // stop video playback
  \}\);
\}'''

new_logic = '''// ─── Demo Video Logic ─────────────────────────────────────────────
const DEMO_LOCAL_VIDEOS = {
  squat: 'assets/squat.mp4',
  pushup: 'assets/pushup.mp4',
  plank: 'assets/plank.mp4',
  shoulderpress: 'assets/shoulderpress.mp4',
  bicepscurl: 'assets/bicepscurl.mp4'
};

const btnDemo = document.getElementById('btn-demo');
const demoModal = document.getElementById('demo-modal');
const btnCloseDemo = document.getElementById('btn-close-demo');
const demoVideo = document.getElementById('demo-video');
const demoModalTitle = document.getElementById('demo-modal-title');

if (btnDemo) {
  btnDemo.addEventListener('click', () => {
    const exId = state.currentEx;
    demoModalTitle.textContent = EXERCISES[exId].name + ' Demo';
    demoVideo.src = DEMO_LOCAL_VIDEOS[exId] || 'assets/squat.mp4';
    demoModal.style.display = 'flex';
    demoVideo.play().catch(e => console.log('Autoplay prevented', e));
  });
}

if (btnCloseDemo) {
  btnCloseDemo.addEventListener('click', () => {
    demoModal.style.display = 'none';
    demoVideo.pause();
    demoVideo.src = '';
  });
}'''

app_js = re.sub(old_logic, new_logic, app_js)

with open('frontend/app.js', 'w') as f:
    f.write(app_js)

print("Updated app.js correctly")
