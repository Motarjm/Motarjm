from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint

llm = HuggingFaceEndpoint(
    repo_id="meta-llama/Llama-3.1-8B-Instruct",
    max_new_tokens=512,
    do_sample=True,
    temperature=0.3,
    provider="auto",  # let Hugging Face choose the best provider for you
)

translator = ChatHuggingFace(llm=llm)

evaluator =  ChatHuggingFace(llm=llm)

advisor =  ChatHuggingFace(llm=llm)