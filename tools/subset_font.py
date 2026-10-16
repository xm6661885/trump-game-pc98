"""Re-subset the pixel font to exactly the glyphs the game uses and inline it in assets/style.css.
usage: python tools/subset_font.py path/to/fusion-pixel-12px-proportional-zh_hans.otf  (needs fonttools + brotli)"""
import sys,re,base64,io,pathlib
from fontTools import subset
from fontTools.ttLib import TTFont
root=pathlib.Path(__file__).resolve().parent.parent
text=''.join((root/f).read_text('utf8') for f in ['index.html','assets/main.js','assets/game.js'])
chars=set(text)|set(map(chr,range(32,127)))
chars={c for c in chars if ord(c)>=32}
f=TTFont(sys.argv[1])
opt=subset.Options();opt.flavor='woff2';opt.layout_features=['*'];opt.name_IDs=['*']
s=subset.Subsetter(opt);s.populate(text=''.join(sorted(chars)));s.subset(f)
cmap=f.getBestCmap();missing=sorted(c for c in chars if ord(c) not in cmap and not c.isspace())
b=io.BytesIO();f.flavor='woff2';f.save(b)
face="@font-face{font-family:'FusionPixel';font-style:normal;font-weight:400;font-display:block;src:url(data:font/woff2;base64,%s) format('woff2')}"%base64.b64encode(b.getvalue()).decode()
css=(root/'assets/style.css').read_text('utf8')
css=re.sub(r"@font-face\{font-family:'FusionPixel'[^}]*\}",lambda m:face,css,count=1)
(root/'assets/style.css').write_text(css,'utf8')
print('glyphs',len(cmap),'woff2 bytes',len(b.getvalue()),'missing',''.join(missing))
