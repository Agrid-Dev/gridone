#!/bin/sh

ln -sfn ../../.githooks/pre-push.sh .git/hooks/pre-push
chmod +x .githooks/pre-push.sh
