#!/bin/sh
# Baut Notizen.html und führt alle Browser-Tests aus (Electron-Test separat: xvfb-run -a node etest.js "$PWD/etest")
cd "$(dirname "$0")" || exit 1
sh build.sh || exit 1
mkdir -p out
fail=0
run() { name=$1; shift; "$@" > "out/$name.txt" 2>&1; rc=$?; echo "$name: exit $rc"; [ $rc -eq 0 ] || fail=1; }
run test3 node t3/test3.js
run hl node t3/hl.js
run diff node t3/diff.js
run width node t3/width.js
run hlz node t3/hlz.js
run rerender node t3/rerender.js
run bench node t3/bench.js
run bench2 node t3/bench2.js
run barwidth node t3/barwidth.js "$PWD/Notizen.html"
run barlong node t3/barlong.js "$PWD/Notizen.html" "$PWD/t3/barlong.png"
run shapes node t3/shapes.js
run paper node t3/paper.js
run books node t3/books.js
run integ node t3/integ.js
run custom node t3/custom.js
run shot node t3/shot.js
run shotui node t3/shotui.js
exit $fail
