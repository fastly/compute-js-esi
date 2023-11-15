(
  cd ../../..
  npm install
  npm run build
)

(
  cd ./edge
  npm install
)

(
  cd ./test

  # serve files in ./public on port 8080
  npm install
  npx http-server -s &
  PID=$!

  echo Starting E2E tests...
  node --test

  # end the test server
  npx tree-kill $PID
)
