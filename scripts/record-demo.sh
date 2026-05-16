#!/usr/bin/env bash
# Records a single window's region with ffmpeg/x11grab and produces docs/demo.gif.
# Usage: scripts/record-demo.sh [duration_seconds=25] [pre_delay_seconds=5]
set -euo pipefail

DURATION="${1:-25}"
DELAY="${2:-5}"
OUT_DIR="docs"
OUT_MP4="$OUT_DIR/demo.mp4"
OUT_GIF="$OUT_DIR/demo.gif"
MAX_W=1280

mkdir -p "$OUT_DIR"

echo "Click on the window you want to record..."
GEOM=$(xwininfo -frame)

X=$(awk '/Absolute upper-left X/ {print $4}' <<<"$GEOM")
Y=$(awk '/Absolute upper-left Y/ {print $4}' <<<"$GEOM")
W=$(awk '/Width:/  {print $2}' <<<"$GEOM")
H=$(awk '/Height:/ {print $2}' <<<"$GEOM")

# h264 requires even dimensions
W=$(( W - W % 2 ))
H=$(( H - H % 2 ))
echo "Captured window: ${W}x${H} @ +${X},${Y}"

if [ "$W" -gt "$MAX_W" ]; then
  SCALE_FILTER="scale=$MAX_W:-2"
else
  SCALE_FILTER="scale=$W:$H"
fi

echo
echo "Recording starts in $DELAY seconds, then runs for $DURATION seconds."
echo "Do NOT move or resize the window during the countdown or recording."
for ((i=DELAY; i>0; i--)); do
  printf "\r  Starting in %ds..." "$i"
  sleep 1
done
printf "\r%-40s\n" "  Recording..."

ffmpeg -y -hide_banner -loglevel error \
  -f x11grab -framerate 15 -video_size "${W}x${H}" -i ":0.0+${X},${Y}" \
  -t "$DURATION" \
  -vf "$SCALE_FILTER" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
  "$OUT_MP4"

echo "Converting to optimized GIF..."
ffmpeg -y -hide_banner -loglevel error \
  -i "$OUT_MP4" \
  -vf "fps=10,scale='min(900,iw)':-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" \
  -loop 0 \
  "$OUT_GIF"

echo
echo "Output:"
ls -lh "$OUT_MP4" "$OUT_GIF"
echo
echo "Preview: xdg-open $OUT_GIF"
