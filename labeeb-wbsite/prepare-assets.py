from pathlib import Path
from PIL import Image
import shutil

root = Path(__file__).resolve().parent
assets = root / 'assets'
assets.mkdir(exist_ok=True)
images = {'about':'19-about.png','assistant':'07-assistant-conversation.png','assistant-en':'09-assistant-en-light.png','direct-download':'28-video-downlaod.png','video-download':'15-video-download.png','library':'14-downloads-library.png'}
for name, filename in images.items():
    with Image.open(root / 'images' / filename) as image:
        image.thumbnail((1600, 1200), Image.Resampling.LANCZOS)
        image.convert('RGB').save(assets / (name + '.webp'), 'WEBP', quality=88, method=6)
shutil.copy2(root.parent / 'src/assets/labeeb-logo.png', assets / 'logo.png')
shutil.copy2(root.parent / 'LICENSE', assets / 'LICENSE.txt')
shutil.copy2(root.parent / 'licenses/Tajawal-OFL.txt', assets / 'Tajawal-OFL.txt')
for subset in ['arabic','latin']:
    for weight in [400,700]:
        filename=f'tajawal-{subset}-{weight}-normal.woff2'
        shutil.copy2(root.parent / 'node_modules/@fontsource/tajawal/files' / filename, assets / filename)
print('Prepared optimized screenshots, local fonts and licenses.')
