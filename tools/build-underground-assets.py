"""Pack generated material swatches into crisp 48px textures and existing edge masks.

Run from any directory: python tools/build-underground-assets.py
Only crops, nearest-neighbor sizing, palette reduction and alpha packing are used.
"""
from pathlib import Path
from PIL import Image, ImageChops

ASSETS = Path(__file__).resolve().parents[1] / 'assets' / 'terrain'
source = Image.open(ASSETS / 'sources' / 'underground-materials.png').convert('RGB')
width, height = source.size
xs = [(3, width // 2 - 3), (width // 2 + 3, width - 3)]
ys = [(3, height // 2 - 3), (height // 2 + 3, height - 3)]
materials = [('monastery-floor', 0, 0), ('cave-earth', 1, 0),
             ('wall-monastery', 0, 1), ('wall-dungeon', 1, 1)]
edge_masks = Image.open(ASSETS / 'sand.png').convert('RGBA').getchannel('A')

for name, column, row in materials:
    texture = source.crop((xs[column][0], ys[row][0], xs[column][1], ys[row][1]))
    texture = texture.resize((24, 24), Image.Resampling.NEAREST)
    texture = texture.quantize(colors=24, method=Image.Quantize.MEDIANCUT,
                               dither=Image.Dither.NONE).convert('RGB')
    tile = texture.resize((48, 48), Image.Resampling.NEAREST)
    if name.startswith('wall-'):
        tile.save(ASSETS / f'{name}.png', optimize=True)
        continue
    variants = Image.new('RGB', (144, 48))
    for variant in range(3):
        shifted = ImageChops.offset(texture, variant * 8, variant * 4)
        variants.paste(shifted.resize((48, 48), Image.Resampling.NEAREST), (variant * 48, 0))
    variants.save(ASSETS / f'{name}.png', optimize=True)
    edges = Image.new('RGBA', edge_masks.size)
    for index in range(47):
        x, y = (index % 8) * 48, (index // 8) * 48
        overlay = tile.convert('RGBA')
        overlay.putalpha(edge_masks.crop((x, y, x + 48, y + 48)))
        edges.paste(overlay, (x, y))
    edges.save(ASSETS / f'{name}-edges.png', optimize=True)

print('Prepared two floors, 94 floor transitions and two wall textures at 48x48.')
