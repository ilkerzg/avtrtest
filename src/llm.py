import time
import os
from collections import deque
from openai import OpenAI
from src.basereal import BaseReal
from src.log import logger
from src.config import get_llm_api_key, get_llm_base_url, get_llm_model_name, get_fal_api_key, get_fal_llm_model

# 检查是否使用 fal.ai LLM
USE_FAL_LLM = os.getenv('USE_FAL_LLM', '0') == '1'

api_key = get_llm_api_key()
base_url = get_llm_base_url()
model_name = get_llm_model_name()

# 初始化客户端
fal_client = None
client = None

if USE_FAL_LLM:
    # 使用 fal.ai LLM
    fal_api_key = get_fal_api_key()
    fal_model = get_fal_llm_model()
    try:
        import fal_client as fc
        fc.api_key = fal_api_key
        fal_client = fc
        logger.info(f"Using fal.ai LLM: {fal_model}")
        logger.debug(f"fal api_key: {fal_api_key[:10]}...")
    except ImportError:
        logger.warning("fal-client not installed, falling back to OpenAI compatible API")
        USE_FAL_LLM = False

if not USE_FAL_LLM:
    # 使用 OpenAI 兼容 API
    show_api_key = api_key[:10] + "..." if api_key else "None"
    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
    )
    logger.debug(f"llm api_key: {show_api_key}, llm base_url: {base_url}, llm model: {model_name}")

# 全局对话历史管理
# key: session_id, value: deque of messages (最多保留10轮，即20条消息)
_conversation_history = {}
MAX_HISTORY_ROUNDS = 10  # 最多保留10轮对话
MAX_HISTORY_MESSAGES = MAX_HISTORY_ROUNDS * 2  # 每轮2条消息（user + assistant）

# System prompt - Always respond in English
SYSTEM_PROMPT = 'You are a friendly and helpful AI assistant. Always respond in English only. Keep your answers concise and conversational. Do not use markdown formatting - respond in plain text only.'


def get_conversation_history(session_id):
    """获取指定session的对话历史"""
    if session_id not in _conversation_history:
        _conversation_history[session_id] = deque(maxlen=MAX_HISTORY_MESSAGES)
    return _conversation_history[session_id]


def add_to_history(session_id, role, content):
    """添加消息到对话历史
    
    Args:
        session_id: 会话ID
        role: 'user' 或 'assistant'
        content: 消息内容
    """
    history = get_conversation_history(session_id)
    history.append({'role': role, 'content': content})


def clear_conversation_history(session_id=None):
    """清除对话历史
    
    Args:
        session_id: 指定session_id清除特定会话，None则清除所有
    """
    global _conversation_history
    if session_id is None:
        _conversation_history.clear()
        logger.info("All conversation history cleared")
    elif session_id in _conversation_history:
        del _conversation_history[session_id]
        logger.info(f"Session {session_id} conversation history cleared")


def build_messages(session_id, current_message):
    """构建完整的消息列表（系统提示词 + 历史 + 当前消息）
    
    Args:
        session_id: 会话ID
        current_message: 当前用户消息
    
    Returns:
        完整的消息列表
    """
    messages = [{'role': 'system', 'content': SYSTEM_PROMPT}]
    
    # 添加历史消息
    history = get_conversation_history(session_id)
    messages.extend(list(history))
    
    # 添加当前消息
    messages.append({'role': 'user', 'content': current_message})
    
    return messages


def llm_response(message, nerfreal: BaseReal, session_id=None):
    """生成LLM响应（支持多轮对话）
    
    Args:
        message: 用户输入消息
        nerfreal: BaseReal实例
        session_id: 会话ID，用于区分不同用户/会话的对话历史
    """
    # 如果没有提供session_id，使用nerfreal的sessionid
    if session_id is None:
        session_id = getattr(nerfreal, 'sessionid', 'default')
    
    logger.debug(f"Session {session_id}: User message: {message}")
    
    if USE_FAL_LLM:
        _llm_response_fal(message, nerfreal, session_id)
    else:
        _llm_response_openai(message, nerfreal, session_id)


def _llm_response_openai(message, nerfreal: BaseReal, session_id):
    """使用 OpenAI 兼容 API 生成响应"""
    # 构建包含历史的消息列表
    messages = build_messages(session_id, message)
    
    start = time.perf_counter()
    completion = client.chat.completions.create(
        model=model_name,  # 使用配置文件中的模型名称
        messages=messages,
        stream=True,
        stream_options={"include_usage": True}
    )
    
    result = ""
    assistant_response = ""  # 完整的助手响应
    first = True
    first_tts = True  # 是否是第一次发送TTS
    
    # 只在大标点处分割（句号、问号、感叹号、分号）
    major_punctuation = "。！？；.!?;"
    
    for chunk in completion:
        if len(chunk.choices) > 0:
            if first:
                end = time.perf_counter()
                logger.debug(f"llm Time to first chunk: {end - start}s")
                first = False
            msg = chunk.choices[0].delta.content
            if msg:
                assistant_response += msg  # 累积完整响应
                lastpos = 0
                for i, char in enumerate(msg):
                    # 只在大标点处分割
                    if char in major_punctuation:
                        result = result + msg[lastpos:i + 1]
                        lastpos = i + 1
                        # 立即发送给TTS，无需等待长度限制
                        if len(result.strip()) > 0:
                            if first_tts:
                                first_tts = False
                            nerfreal.put_msg_txt(result)
                            result = ""
                result = result + msg[lastpos:]
    
    end = time.perf_counter()
    # 处理最后剩余的文本（如果没有以大标点结尾）
    if result.strip():
        nerfreal.put_msg_txt(result)
    
    # 保存到对话历史
    add_to_history(session_id, 'user', message)
    add_to_history(session_id, 'assistant', assistant_response)


def _llm_response_fal(message, nerfreal: BaseReal, session_id):
    """使用 fal.ai LLM API 生成响应"""
    fal_model = get_fal_llm_model()
    
    # 构建完整提示词
    history = get_conversation_history(session_id)
    prompt = f"{SYSTEM_PROMPT}\n\n"
    
    # 添加历史对话
    for msg in history:
        role = "User" if msg['role'] == 'user' else "Assistant"
        prompt += f"{role}: {msg['content']}\n"
    
    prompt += f"User: {message}\nAssistant:"
    
    start = time.perf_counter()
    
    try:
        # 使用 fal.ai any-llm API
        result = fal_client.subscribe(
            "fal-ai/any-llm",
            arguments={
                "model": fal_model,
                "prompt": prompt,
                "system_prompt": SYSTEM_PROMPT,
                "max_tokens": 2048,
                "temperature": 0.7
            }
        )
        
        end = time.perf_counter()
        logger.debug(f"fal.ai LLM response time: {end - start:.2f}s")
        
        assistant_response = result.get('output', '')
        
        if assistant_response:
            # 处理响应并发送到 TTS
            _process_and_send_response(assistant_response, nerfreal)
            
            # 保存到对话历史
            add_to_history(session_id, 'user', message)
            add_to_history(session_id, 'assistant', assistant_response)
        else:
            logger.warning(f"Empty response from fal.ai LLM: {result}")
            
    except Exception as e:
        logger.exception(f"fal.ai LLM error: {e}")


def _process_and_send_response(response: str, nerfreal: BaseReal):
    """处理响应并分段发送到 TTS"""
    major_punctuation = "。！？；.!?;"
    result = ""
    
    for char in response:
        result += char
        if char in major_punctuation:
            if result.strip():
                nerfreal.put_msg_txt(result)
                result = ""
    
    # 发送剩余的文本
    if result.strip():
        nerfreal.put_msg_txt(result)
    