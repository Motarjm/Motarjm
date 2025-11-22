
SYSTEM_PROMPT = "You are an expert linguist, specializing in translation from {source_lang} to {target_lang}."

TRANSLATE_PROMPT="""This is an {source_lang} to {target_lang} translation, please provide the {target_lang} translation for this text. \
Do not provide any explanations or text apart from the translation.
{source_lang}: {source_text}

{target_lang}:"""