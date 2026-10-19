import json
import time
from collections import Counter
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

with open("evals/test_emails.json") as f:
    examples = json.load(f)

cat_correct = pri_correct = 0

for ex in examples:
    category = client.post("/classify/category", json={"subject": ex["subject"], "body": ex["body"]})
    priority = client.post("/classify/priority", json={"subject": ex["subject"], "body": ex["body"]})
    pred_category = category.json()
    pred_priority = priority.json()
    if pred_category["category"] == ex["category"]:
        cat_correct += 1
    if pred_priority["priority"] == ex["priority"]:
        pri_correct += 1


n = len(examples)
print(f"Categorisation accuracy: {cat_correct}/{n} ({cat_correct/n:.0%})")
print(f"Prioritisation accuracy: {pri_correct}/{n} ({pri_correct/n:.0%})")
