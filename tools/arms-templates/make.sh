#!/usr/bin/env bash
# Remakes the painting templates in assets/arms/templates from the 3D arms as they are now (js/arms3d.js).
# Needs Pillow (python3 -m pip install --target <dir> pillow, then PYTHONPATH=<dir>) and the Playwright Chromium.
#
#   PYTHONPATH=<pillow dir> tools/arms-templates/make.sh
#
# Only needed if the shape of the arms changes so much that the layout moves. Keep the layout fixed whenever possible:
# the paintings in assets/arms are drawn on it.
set -e
cd "$(dirname "$0")"
OUT=../../assets/arms/templates
node uv_dump.js                                  # where every piece sits on its texture -> work/uv_layout.json
python3 uv_colours.py work work/uvcol            # each piece in its own colour
node showcase.js                                 # the arms wearing those colours, from a few angles
python3 uv_templates.py work "$OUT"              # outlines (+ notes)
python3 uv_colour_labels.py work "$OUT"          # coloured, and coloured with names
python3 uv_sheets.py work "$OUT"                 # colour maps beside the arms that wear them
