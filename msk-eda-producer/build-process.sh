#!/bin/bash

docker build -t msk-eda-producer .
docker tag msk-eda-producer:latest 443535183963.dkr.ecr.us-east-1.amazonaws.com/msk-eda-producer:latest
docker push 443535183963.dkr.ecr.us-east-1.amazonaws.com/msk-eda-producer:latest