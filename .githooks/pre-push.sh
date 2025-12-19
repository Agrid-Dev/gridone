#!/bin/bash

# Function to run a command and handle its output
run_check() {
  local name="$1"
  local cmd="$2"
  local fail_msg="$3"

  echo -n "$name... "
  if $cmd > /dev/null 2>&1; then
      echo "🟢 Passed"
      return 0
  else
      echo "🔴 $fail_msg"
      return 1
  fi
}

echo "Running pre-push checks..."
echo "---------------------------------------------"

# Initialize a variable to track overall success
failed_count=0
# Run all checks using the function
run_check "🧹 Ruff check "       "uv run ruff check ."    "Failed" || ((failed_count += 1))
run_check "📏 Ruff format"      "uv run ruff format --check ." "Failed" || ((failed_count += 1))
run_check "🔍 Type check "       "uv run ty check"    "Failed" || ((failed_count += 1))
run_check "🧪 Tests      "      "uv run pytest -m not(integration)"    "Failed" || ((failed_count += 1))

echo "---------------------------------------------"
if [ "$failed_count" -eq 0 ]; then
  echo "🎉 All checks passed! Proceeding with push."
  exit 0
else
  echo "🚨 $failed_count check(s) failed. Fix the issues before pushing."
  exit 1
fi
