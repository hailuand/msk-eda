#!/bin/bash

docker build -t msk-eda-consumer .
docker tag msk-eda-consumer:latest 443535183963.dkr.ecr.us-east-1.amazonaws.com/msk-eda-consumer:latest
docker push 443535183963.dkr.ecr.us-east-1.amazonaws.com/msk-eda-consumer:latest