# Skills Progressive Disclosure System

> Load and present skills contextually based on task relevance.

## Overview
Instead of loading all 85+ skills at once (which wastes context), progressively disclose skills based on what the current task needs. This is the "show only what's relevant" pattern.

## How It Works
```
User Message → Intent Classification → Skill Category Selection → Load Relevant Skills
```

## Category-to-Task Mapping

### AI/ML Development
| User Intent | Skills to Load |
|------------|---------------|
| Building/training models | 01-architecture, 03-fine-tuning, 08-distributed-training |
| Model optimization | 10-optimization, 19-emerging-techniques |
| Deploying models | 12-inference-serving, 09-infrastructure |
| Data pipeline work | 05-data-processing, 13-mlops |
| RAG/search system | 15-rag, 14-agents |
| Prompt engineering | 16-prompt-engineering |
| Model evaluation | 11-evaluation, 17-observability |
| Multimodal work | 18-multimodal |
| Safety/alignment | 07-safety-alignment |
| Research writing | 20-ml-paper-writing |

### Security Testing
| User Intent | Skills to Load |
|------------|---------------|
| Penetration testing | 21-security-testing (all) |
| OSINT/recon | 21-security-testing/osint, 21-security-testing/web-scraping |
| Network analysis | 21-security-testing/network-monitoring |
| Access control audit | 21-security-testing/face-recognition |
| Threat intelligence | 21-security-testing/dark-web-recon |

### General Development
| User Intent | Skills to Load |
|------------|---------------|
| Code review | (no AI skills needed — use code-reviewer agent) |
| Architecture design | (use architect agent) |
| DevOps/deploy | (use devops-engineer agent) |

## Intent Detection Keywords

```javascript
const SKILL_TRIGGERS = {
  'model|train|fine-tune|LoRA|PEFT': ['01', '03', '08', '10'],
  'deploy|serve|inference|vLLM': ['12', '09'],
  'RAG|retrieval|vector|embed': ['15', '14'],
  'prompt|DSPy|few-shot': ['16'],
  'security|pentest|audit|vulnerability': ['21'],
  'OSINT|recon|footprint': ['21/osint', '21/web-scraping'],
  'network|traffic|packet|sniff': ['21/network'],
  'data|pipeline|ETL|process': ['05', '13'],
  'eval|benchmark|harness': ['11'],
  'safety|alignment|guard|constitutional': ['07'],
  'multimodal|vision|audio|speech': ['18'],
  'paper|research|NeurIPS|ICML': ['20'],
  'optimize|quantize|prune|distill': ['10', '19'],
  'interpret|mechanistic|probe': ['04'],
};
```

## Loading Strategy
1. **Always loaded**: Self-learning (22), project CLAUDE.md
2. **On-demand**: Match user intent → load 1-3 relevant skill categories
3. **Never preloaded**: All 85 skills at once (context waste)

## Benefits
- Reduces context window usage by ~80%
- Faster response times (less context to process)
- More focused, relevant responses
- Skills remain available when truly needed
