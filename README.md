<div align="center">
  <a href="https://github.com/ilkerzg/avtrtest">
    <img src="https://raw.githubusercontent.com/shibing624/AIAvatar/main/docs/logo-avatar.png" height="150" alt="Logo">
  </a>
</div>

-----------------

# AIAvatar: Build Your Personal Digital Avatar
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![License Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![python_version](https://img.shields.io/badge/Python-3.10%2B-green.svg)](requirements.txt)
[![GitHub issues](https://img.shields.io/github/issues/ilkerzg/avtrtest.svg)](https://github.com/ilkerzg/avtrtest/issues)

**AIAvatar**: Real-time interactive streaming digital avatar with synchronized audio and video dialogue. Achieves commercial-grade quality.

![wav2lip](https://github.com/shibing624/AIAvatar/blob/main/docs/snap.png)

## Features
- Wav2Lip lip-sync model for digital avatars
- Voice cloning support
- Interruption during avatar speech
- WebRTC output support
- Action choreography: custom video playback when idle
- Multi-concurrency, frontend-backend separation, GPU model service deployment, CPU frontend service

## Model Architecture

![model](https://github.com/shibing624/AIAvatar/blob/main/docs/main.png)

## Install

### Install Dependencies

```bash
conda create -n avatar python=3.10
conda activate avatar
conda install pytorch==2.5.0 torchvision==0.20.0 torchaudio==2.5.0 pytorch-cuda=12.4 -c pytorch -c nvidia
pip install -r requirements.txt
``` 

## Quick Start

### Automatic Model Download (Recommended)
The project automatically downloads necessary models and avatar files from HuggingFace on first run:

- **Model File**: wav2lip.pth (215 MB) - Wav2Lip256 lip-sync generation model
- **Avatar Files**:
  - wav2lip_avatar_female_model (353 MB) - Female digital avatar 
  - wav2lip_avatar_glass_man (88.4 MB) - Male digital avatar with glasses
  - wav2lip_avatar_long_hair_girl (153 MB) - Long-haired female digital avatar

Simply run the project, and the system will automatically check and download missing files.

**Configuration**: Download settings are in `config.yml` under `DOWNLOAD` section.

### Manual Model Download (Alternative)
If automatic download fails:
- HuggingFace: https://huggingface.co/shibing624/ai-avatar-wav2lip
- Copy wav2lip.pth to the `models` directory
- Extract avatar files to the `data` directory

### Run

#### Method 1: Using Startup Script (Recommended)
```bash
# Use default female avatar, port 8010
./run.sh

# Use male avatar with glasses
./run.sh wav2lip_avatar_glass_man

# Use long-haired female avatar, custom port
./run.sh wav2lip_avatar_long_hair_girl 8010
```

#### Method 2: Direct Run
```bash
# Use default female avatar
python main.py

# Use specified avatar
python main.py --avatar_id wav2lip_avatar_female_model
python main.py --avatar_id wav2lip_avatar_glass_man  
python main.py --avatar_id wav2lip_avatar_long_hair_girl --tts fal

# Custom port
python main.py --port 8010
```

#### Method 3: Remote GPU Service Deployment (Production)
Supports frontend-backend separation deployment.

**Step 1: Start GPU Service (on GPU server)**
```bash
python src/gpu_wav2lip_service.py --port 8080 --batch_size 32 --fp16
```

**Step 2: Start Frontend Service (on CPU server)**
```bash
python main.py --gpu_server_url http://192.168.1.100:8080 --port 8010
```

**GPU Service Parameters:**
- `--port`: GPU service listening port, default 8080
- `--batch_size`: Batch size, recommended 16-64, default 32
- `--fp16`: Enable FP16 half-precision inference, 30-50% faster
- `--model_path`: Model path, default `./models/wav2lip.pth`

#### Access
- WebRTC Frontend: http://127.0.0.1:8010/index.html
- Required ports: tcp:8010; udp:1-65536

## Create Your Own Avatar

Use your own video to create custom digital avatar.

### Step 1: Prepare Video
- Person should be **silent with mouth closed** (for idle animations)
- Clear face, front-facing recommended
- Supported formats: mp4, avi, mov
- Duration: 5-30 seconds, frame rate: 25-30fps

### Step 2: Generate Avatar
```bash
python src/wav2lip/genavatar.py --video_path your_video.mp4 --img_size 256 --avatar_id wav2lip_avatar_custom
```

### Step 3: Copy to Project
```bash
cp -r results/avatars/wav2lip_avatar_custom data/
```

### Step 4: Use Custom Avatar
```bash
python main.py --avatar_id wav2lip_avatar_custom
```

## Performance

| Model      | GPU       | FPS |
|------------|-----------|-----|
| wav2lip256 | RTX 3060  | 60  |
| wav2lip256 | RTX 3080Ti| 120 |

Requires RTX 3060 or higher.

## TTS (Text-to-Speech)

### Fal.ai TTS (Recommended)

Using [Fal.ai](https://fal.ai) TTS service with multiple model options:
- `kokoro` - Fast English TTS, multiple voices
- `xtts` - Multi-language TTS with Chinese support and voice cloning
- `f5-tts` - High-quality speech synthesis
- `mars5-tts` - Deep voice cloning

**Configuration:**
1. Get API Key from [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)
2. Configure in `config.yml`:
```yaml
FAL:
  FAL_API_KEY: "your-api-key"
  FAL_TTS_MODEL: "kokoro"  # or xtts, f5-tts, mars5-tts
  FAL_TTS_VOICE: "af_heart"  # kokoro voice options
```
3. Run with TTS type:
```bash
python main.py --tts fal
```

**Voice Cloning Example (Chinese):**
```bash
python main.py --tts fal --REF_FILE "https://your-ref-audio.wav"
```

### Other TTS Options
- `doubao` - Volcengine Doubao TTS (Chinese)
- `doubao3` - Doubao TTS 2.0 (Chinese)
- `azuretts` - Azure Speech Services
- `tencent` - Tencent Cloud TTS

## LLM (Language Model)

### Default: OpenAI Compatible API
Configure in `config.yml`:
```yaml
LLM:
  LLM_API_KEY: "your-api-key"
  LLM_BASE_URL: "https://api.openai.com/v1"
  LLM_MODEL_NAME: "gpt-4"
```

### Optional: Fal.ai LLM
Using Fal.ai's any-llm service for unified access to multiple models:

**Configuration:**
```yaml
FAL:
  FAL_API_KEY: "your-api-key"
  FAL_LLM_MODEL: "google/gemini-2.5-flash"
```

**Enable Fal LLM:**
```bash
export USE_FAL_LLM=1
python main.py
```

**Supported LLM Models:**
- `google/gemini-2.5-flash` - Google Gemini (Recommended, fast)
- `anthropic/claude-3.5-sonnet` - Claude 3.5 Sonnet
- `openai/gpt-4o` - GPT-4o
- `deepseek/deepseek-r1` - DeepSeek R1
- `meta-llama/llama-3.2-3b-instruct` - Llama 3.2

## Citation

If you use AIAvatar in your research, please cite:

```bibtex
@misc{Xu_AIAvatar,
  title={AIAvatar: Build Your Personal Digital Avatar},
  author={Xu Ming},
  year={2025},
  howpublished={\url{https://github.com/shibing624/AIAvatar}},
}
```

## License

Licensed under [The Apache License 2.0](/LICENSE), free for commercial use.

## Acknowledgements 

- [MuseTalk](https://github.com/TMElyralab/MuseTalk)
- [LiveTalking](https://github.com/lipku/LiveTalking)
- [Fal.ai](https://fal.ai) - AI Model APIs

Thanks for their great work!
