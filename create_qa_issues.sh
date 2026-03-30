#!/bin/bash

# Script to create QA issues in GitHub

# Array of issues to create
issues=(
  "Login Issue"
  "Password Reset Issue"
  "Unauthorized Access Issue"
  "Resume Builder Issue"
  "Resume Enhancement Issue"
  "Resume Templates Issue"
  "Cover Letters Issue"
  "Indeed Tracker Issue"
  "LinkedIn Tracker Issue"
  "Seek Tracker Issue"
  "Job Analytics Issue"
  "Bot Logs Issue"
  "Bot Configuration Issue"
  "Files Issue"
  "Questions Issue"
  "Control Bar Issue"
  "Orders Issue"
  "Payment Issue"
  "Plans Issue"
  "Tokens Issue"
  "App Core Testing Issue"
)

# Array of labels for issues
labels=(
  "bug"
  "feature"
  "enhancement"
  "question"
  "documentation"
)

# Base issue body template
body="This is a detailed description of the issue at hand. Please provide the necessary context and details to facilitate resolution."

# Loop through issues and create them
for ((i=0; i<${#issues[@]}; i++)); do
  gh issue create \
    --title "[32m${issues[i]}[0m" \
    --body "${body}" \
    --label "${labels[i % ${#labels[@]}]}"
  echo "Created issue: ${issues[i]}"
done
