#!/bin/bash

docker build -t msk-eda-proco .
docker tag msk-eda-proco:latest 443535183963.dkr.ecr.us-east-1.amazonaws.com/msk-eda-proco:latest
docker push 443535183963.dkr.ecr.us-east-1.amazonaws.com/msk-eda-proco:latest