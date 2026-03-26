from app.core.graph_models import *
from app.core.workflow import graph
from langchain.messages import AIMessage, HumanMessage, SystemMessage
import re
import json
import numpy as np
import matplotlib.pyplot as plt
from langsmith import Client, trace


client = Client()

# NUM_OF_SAMPLES = 3
PROJECT_NAME = "Turjman"

translated_content = [[{'text': 'Section 101. — Definitions. As used in this Ordinance, unless the context dearly\nindicates a different meaning, the following words and phrases shall have the meaning\nset forth below:\n',
  'bbox': [84.24752044677734,
   119.08920288085938,
   538.4818115234375,
   161.30580139160156]},
                       
 {'text': 'U.S.C. S 501(c)(9), or any qualified pension or retirement plan or trust of a private\nemployer or a multiemployer plan or trust; including any qualified plan or trust\ndescribed under; 26 U.S.C. S 501(c)(22); 26 U.S.C. S 501(c)(24); or 26 U.S.C. SS\n501 (c)(25)(C)(i), (i) or (i);\n',
  'bbox': [85.24816131591797,
   418.56866455078125,
   541.1875,
   473.17852783203125]},
 {'text': '(c) "Gross Receipts" - cash, credits, property of any kind or nature received\nin or allocable to the City of Pittsburgh from any Institution by reason of any Service\nrendered in the City, without deduction therefrom on account of property sold, materials\nused, labor, service, or other cost, interest or discount paid, or any other expense.\n',
  'bbox': [85.05886840820312,
   559.1959228515625,
   540.8177490234375,
   615.86328125]},
 
 {'text': '(1)\nCorporations organized under an Act of Congress which are\ninstrumentalities of the United States, including any entity described in 26 U.S.C. S\n501();\n',
  'bbox': [84.67276000976562,
   221.0489044189453,
   541.202880859375,
   263.55377197265625]},
 
 {'text': '(8)\nAny organization exempt from tax under 26 U.S.C. 501, which is\nnot listed in the classes of Taxable Institutions under Section 101(e) of these\nRegulations.\n',
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
#  {'text': '(7)\nAny regulated financial institution under the Tax Reform Code of\n1971, 72 P.S. S 7401(6); and.\n',
#   'bbox': [85.88772583007812,
#    477.8388977050781,
#    541.2684326171875,
#    507.13433837890625]},
#  {'text': '(2) The United States, any State or political subdivision thereof, any\nauthority of the state or local govemment, any elementary or secondary school within\nthe City (public or private), and any federal, state, or municipal pension plan;\n',
#   'bbox': [84.86201477050781,
#    268.850341796875,
#    541.4530029296875,
#    310.7706298828125]},
#  {'text': '(3)\n"Gross Receipts" shall include any payment, income, grants, or\nother aid from federal, state or local governments, including the Medicare and Medicaid\nPrograms as well as Pennsylvania General Assistance.\n',
#   'bbox': [84.36629486083984,
#    688.7288208007812,
#    541.6897583007812,
#    729.1926879882812]},
#  {'text': '(1)\n"Gross Receipts" shall include payments from insurance or other\nthird-party payments for the cost of Service;\n',
#   'bbox': [84.2549819946289,
#    620.6885986328125,
#    540.6781005859375,
#    649.219482421875]},
 
#  {'text': '(3)\nAny Institution of Purely Public charity, under 10 P.S. S 371, that\nprovides the evidence required by 10 P.S. S 376(a);\n',
#   'bbox': [85.22526550292969,
#    315.5815124511719,
#    541.452392578125,
#    345.4708557128906]},
#  {'text': 'ARTICLE I\nGENERAL PROVISIONS\n',
#   'bbox': [231.95632934570312,
#    74.72877502441406,
#    395.0224914550781,
#    114.10306549072266]},
#  {'text': '(2)\n"Gross Receipts" shall include payments for Service rendered to\naffiliates or subsidiaries.\n',
#   'bbox': [84.38446807861328,
#    654.0762329101562,
#    541.05078125,
#    682.32763671875]},
#  {'text': '(b)\n"Exempt Institutions" the following Institutions are exempt from the\nInstitution and Service Privilege Tax:\n',
#   'bbox': [84.25323486328125,
#    189.15174865722656,
#    541.125732421875,
#    215.90200805664062]},
#  {'text': 'GENERAL PROVISIONS\n',
#   'bbox': [232.137939453125,
#    96.60565948486328,
#    394.1809387207031,
#    113.78911590576172]},
#  {'text': 'ARTICLE I\n',
#   'bbox': [280.7748718261719,
#    75.2974624633789,
#    351.138916015625,
#    90.73490142822266]},
#  {'text': 'ARTICLE I\nGENERAL PROVISIONS\nSection 101. — Definitions. As used in this Ordinance, unless the context dearly\nindicates a different meaning, the following words and phrases shall have the meaning\nset forth below:\n(a)\n"City" - the City of Pittsburgh.\n(b)\n"Exempt Institutions" the following Institutions are exempt from the\nInstitution and Service Privilege Tax:\n(1)\nCorporations organized under an Act of Congress which are\ninstrumentalities of the United States, including any entity described in 26 U.S.C. S\n501();\n(2) The United States, any State or political subdivision thereof, any\nauthority of the state or local govemment, any elementary or secondary school within\nthe City (public or private), and any federal, state, or municipal pension plan;\n(3)\nAny Institution of Purely Public charity, under 10 P.S. S 371, that\nprovides the evidence required by 10 P.S. S 376(a);\n(4)\nAny insurance company regulated by the Pennsylvania Insurance\nDepartment;\nAny utility regulated by the Pennsylvania Utility Commission;\n(6)\nAny voluntary employee\'s beneficiary association described in 26\nU.S.C. S 501(c)(9), or any qualified pension or retirement plan or trust of a private\nemployer or a multiemployer plan or trust; including any qualified plan or trust\ndescribed under; 26 U.S.C. S 501(c)(22); 26 U.S.C. S 501(c)(24); or 26 U.S.C. SS\n501 (c)(25)(C)(i), (i) or (i);\n(7)\nAny regulated financial institution under the Tax Reform Code of\n1971, 72 P.S. S 7401(6); and.\n(8)\nAny organization exempt from tax under 26 U.S.C. 501, which is\nnot listed in the classes of Taxable Institutions under Section 101(e) of these\nRegulations.\n(c) "Gross Receipts" - cash, credits, property of any kind or nature received\nin or allocable to the City of Pittsburgh from any Institution by reason of any Service\nrendered in the City, without deduction therefrom on account of property sold, materials\nused, labor, service, or other cost, interest or discount paid, or any other expense.\n(1)\n"Gross Receipts" shall include payments from insurance or other\nthird-party payments for the cost of Service;\n(2)\n"Gross Receipts" shall include payments for Service rendered to\naffiliates or subsidiaries.\n(3)\n"Gross Receipts" shall include any payment, income, grants, or\nother aid from federal, state or local governments, including the Medicare and Medicaid\nPrograms as well as Pennsylvania General Assistance.\n-5-\n',
#   'bbox': [83.70015716552734, 78.9375, 544.13525390625, 747.6865844726562]},
#  {'text': "(4)\nAny insurance company regulated by the Pennsylvania Insurance\nDepartment;\nAny utility regulated by the Pennsylvania Utility Commission;\n(6)\nAny voluntary employee's beneficiary association described in 26\n",
#   'bbox': [86.0157470703125,
#    350.0541076660156,
#    538.7926025390625,
#    417.3725891113281]},
#  {'text': "(4)\nAny insurance company regulated by the Pennsylvania Insurance\nAny utility regulated by the Pennsylvania Utility Commission;\n(6)\nAny voluntary employee's beneficiary association described in 26\n",
#   'bbox': [88.48905944824219,
#    349.9156494140625,
#    540.0639038085938,
#    417.3807067871094]},
#  {'text': '(a)\n"City" - the City of Pittsburgh.\n(b)\n"Exempt Institutions" the following Institutions are exempt from the\n',
#   'bbox': [115.33806610107422,
#    166.30191040039062,
#    540.3346557617188,
#    205.56651306152344]}
   
   ]]
# literature from metaphortrans 
translated_content = [[{'text': 'Nevertheless he became daily more full of _malaise_, and daily, only he knew it not, more ripe for an explosion should a spark fall upon him.',
  'bbox': [84.24752044677734,
   119.08920288085938,
   538.4818115234375,
   161.30580139160156]},
                       
 {'text': 'If he have fairly purchased his hair, the law will protect him in its ownership, even against the claims of the head on which it grew.',
  'bbox': [85.24816131591797,
   418.56866455078125,
   541.1875,
   473.17852783203125]},
 {'text': 'Study his bias leaves, and makes his book thine eyes, Where all those pleasures live that art would comprehend: If knowledge be the mark, to know thee shall suffice.',
  'bbox': [85.05886840820312,
   559.1959228515625,
   540.8177490234375,
   615.86328125]},
 
 {'text': 'And then you overstrain yourself, or so, And tumble downward like the flying fish Gasping on deck, because you soar too high, Bob, And fall for lack of moisture quite a dry Bob.',
  'bbox': [84.67276000976562,
   221.0489044189453,
   541.202880859375,
   263.55377197265625]},
 
 {'text': "How dire a tempest, from Mycenae pour'd, Our plains, our temples, and our town devour'd; What was the waste of war, what fierce alarms Shook Asia's crown with European arms; Ev'n such have heard, if any such there be, Whose earth is bounded by the frozen sea; And such as, born beneath the burning sky And sultry sun, betwixt the tropics lie.",
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
 
 {'text': "The rich are in general slaves to fear, and submit to courtly power with the trembling duplicity of a Spaniel.",
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
 
 {'text': "My thought was that if their keen, practiced eyes had never been able to see this flitting woodland creature with a musical soul, it was not likely that I would succeed in my quest.",
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
 
 {'text': "Her dark hair, like the hair of a Japanese, had come down and covered her body and her face.",
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
 
 {'text': "Down to her bowels went the hot wave of fear.",
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
 
 {'text': "If he had asked me, I might have given myself body and soul.",
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
 
 {'text': "Truly, madam, he holds Belzebub at the stave's end as well as a man in his case may do: he has here writ a letter to you; I should have given it you to-day morning, but as a madman's epistles are no gospels, so it skills not much when they are delivered.",
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
 
 {'text': "As he did so, he saw the face of his portrait leering in the sunlight.",
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
 
 {'text': "Every little, in a long strain, helped, and if he happened to affect her as a firm object she could hold on by, he wouldn't jerk himself out of her reach.",
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
 
 {'text': "He had called them into view, and it was not easy to replace the shroud that had so long concealed them.",
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
 
 {'text': "Guppy, clerk to Kenge and Carboy, who was at first as open as the sun at noon, but who suddenly shut up as close as midnight, under the influence--no doubt--of Mr.",
  'bbox': [85.04833984375,
   512.0928344726562,
   541.5357055664062,
   553.53369140625]},
 
   ]]

# Store experiment metadata
experiment_metadata = {
    "experiment_name": "new_system_metaphorTrans_qwen_deepseek",
    "num_test_cases": len(translated_content),
    "what_changed": "Using system level evaluations, one graph like DRT"
}

def translate(text, source_lang, target_lang):
    state = State(
        source_text=text,
        source_lang=source_lang,
        target_lang=target_lang,
        max_iterations=3,
        prev_context="",
        score_threshold=101)

    response = graph.invoke(state)
    scores = []
    
    translated = response["current_translation"]
    print(translated, end="\n")
    
    
    for msg in response["messages"]:
        
        if msg.agent == "EVALUATOR" and isinstance(msg, AIMessage):
            
            msg.pretty_print()
            evaluation = msg.content
            # capture score
            if matched := re.search(r'\{.*\}', evaluation, re.DOTALL):
                
                matched = matched.group(0)
                score = int(json.loads(matched)["score"])

            else:
                score = 0
                
            scores.append(score)
        
    return scores

# DONE = [
#         [
#             [{'translated_text': '\nالباب 101 - التعريفات. يُراد بالكلمات والعبارات الواردة في هذا المرسوم المعاني المحددة فيما يلي، ما لم يقتضِ السياق خلاف ذلك.', 'evaluations': [AIMessage(content='```json\n{\n  "reason": "The translation is mostly accurate but contains a minor error. The phrase \'unless the context dearly indicates a different meaning\' is translated as \'ما لم يقتضِ السياق خلاف ذلك\', which is close but not entirely accurate. \'Dearly\' in this context is an adverb that emphasizes the clarity of the context, and a more precise translation would be \'ما لم يدل السياق بوضوح على معنى آخر\'. This error is minor as the overall meaning is still understandable.",\n  "score": 95\n}\n```', additional_kwargs={}, response_metadata={}, agent='EVALUATOR'), AIMessage(content='```json\n{\n  "reason": "The translation is mostly accurate, but there are some minor issues. The phrase \'unless the context dearly indicates a different meaning\' is not translated, which is a missing error. Additionally, the translation of \'shall have\' as \'لها\' is not precise and could be better expressed as \'يُعرف ب\'. These issues are minor in nature.",\n  "score": 92\n}\n```', additional_kwargs={}, response_metadata={}, agent='EVALUATOR')]}],
#             [{'translated_text': 'U.S.C. S 501(c)(9)، أو أي خطة أو صندوق تقاعد أو معاش مؤهل لصاحب عمل خاص أو خطة أو صندوق متعدد أصحاب العمل؛ بما في ذلك أي خطة أو صندوق مؤهل موصوف بموجب: 26 U.S.C. S 501(c)(22)؛ 26 U.S.C. S 501(c)(24)؛ أو 26 U.S.C. SS 501(c)(25)(C)(i)، (i) أو (i)؛', 'evaluations': [AIMessage(content='```json\n{\n  "reason": "The translation contains several major errors. The most significant issue is the incorrect translation of the U.S. Code sections, which are crucial for legal and technical accuracy. Additionally, the translation includes unnecessary and incorrect sub-section references, which can lead to confusion and misinterpretation. The overall structure and clarity are also affected by these errors.",\n  "score": 45\n}\n```', additional_kwargs={}, response_metadata={}, agent='EVALUATOR'), AIMessage(content='```json\n{\n  "reason": "The translation contains several minor errors. The major error is the incorrect use of \'S\' (section) which should be \'س\' (sura) in Arabic legal contexts. Additionally, there are minor errors in the translation of \'or\' and the structure of the sentence, which makes it slightly harder to read and understand.",\n  "score": 85\n}\n```', additional_kwargs={}, response_metadata={}, agent='EVALUATOR')]}],
#             [{'translated_text': '(ج) "الإيرادات الإجمالية" - النقد، والأموال، والممتلكات من أي نوع يتم استلامها في مدينة بيتسبرغ أو تُنسب إليها من أي مؤسسة مقابل أي خدمة مُقدَّمة في المدينة، دون أي استقطاع لقيمة الممتلكات المباعة، أو المواد المستخدمة، أو العمالة، أو تكاليف الخدمة، أو أي تكلفة أخرى، أو الفائدة أو الخصم المدفوع، أو أي مصروف آخر.', 'evaluations': [AIMessage(content='```json\n{\n  "reason": "The translation is mostly accurate, but there are a few minor errors that could be improved for better readability and naturalness. Specifically, \'الإيرادات الإجمالية\' is a direct translation and might sound more natural as \'إيرادات المدينة الإجمالية\' to better reflect the context. Additionally, \'المادة المستخدمة\' could be more naturally expressed as \'مواد البناء\' if the context is construction-related, or simply \'مواد\' if it\'s a general term. These are minor issues that do not significantly alter the meaning but could be improved for better fluency.",\n  "score": 92\n}\n```', additional_kwargs={}, response_metadata={}, agent='EVALUATOR'), AIMessage(content='```json\n{\n  "reason": "The translation is mostly accurate but contains a few minor errors. The term \'credits\' is incorrectly translated as \'الأموال\' (the money), which is a minor error as the context suggests it should be \'الرصيد\' (the credit balance). Additionally, the phrase \'or any other expense\' is not fully translated, which is a minor error as it could be more natural to include it for clarity. Overall, the translation conveys the meaning but could be improved for naturalness.",\n  "score": 87\n}\n```', additional_kwargs={}, response_metadata={}, agent='EVALUATOR')]}],
#             [{'translated_text': '(1)\nالشركات المنشأة بموجب قانون صادر عن الكونغرس والتي تُعد من أدوات الولايات المتحدة التنفيذية، بما في ذلك أي كيان مُعرّف بموجب المادة 501 من القانون 26 من المدونة الأمريكية؛', 'evaluations': [AIMessage(content='```json\n{\n  "reason": "The translation is mostly accurate, but there are a few minor errors. The term \'instrumentalities\' is not directly translated, which could be considered a minor error as it might not be immediately clear to the reader. The overall meaning is preserved, but the translation could be slightly more natural in some parts.",\n  "score": 92\n}\n```', additional_kwargs={}, response_metadata={}, agent='EVALUATOR'), AIMessage(content='```json\n{\n  "reason": "The translation is mostly accurate but contains a few minor errors. The phrase \'instrumentalities of the United States\' is translated as \'أدوات تنفيذية للولايات المتحدة\' which is not a direct translation and may not convey the same meaning. Additionally, the reference to \'26 U.S.C. S 501\' is translated as \'المادة 501 من القانون 26 من المدونة الأمريكية\' which is confusing and not standard legal terminology. These issues are minor but affect the clarity and precision of the translation.",\n  "score": 85\n}\n```', additional_kwargs={}, response_metadata={}, agent='EVALUATOR')]}]
#         ]
#        ]


"""
Each page has text blocks:
    Each text block has number of samples, meaning I ran this text block a certain number of times to check if the scores are consistent or not between different runs
        Each sample has a dict
            The dict consists of:
                - 'translated_text', str: the final translated text
                - 'evaluations', list: the evaluations of the different iterations for this text

I want to get the scores of the same block along different sample runs

Meaning If i have a sentence like 'How are you?'
I will make 2 sample runs with 2 iterations

## 1st sample
text:       'How are you?' ->  "kayf halk elyawm" ->   "kayf halk?"
evaluations:               ->         50            ->         80


## 2nd sample
text:           'How are you?' ->  "kayf halkom" ->   "kayf halk elyawm?"
evaluations:                   ->        60      ->             85

I want to take the average of first score from the different samples of the same text block 

(50 + 60) / 2 -> (80 + 85) / 2

The main reason is to check if the overall evaluation scores along the iterations are getting higher and better or not.
And because of the random nature of LLMs I reevaluate the same text block multiple times, hence samples.

Returns:
    - all_samples, list: the outer index is the index of the text block
    the inner index is the index of samples for the same text block 
    the most inner index is the index of iterations
    
    The returned value of the above example will be
    
    [
        [
            [50, 80],
            
            [60, 85]
        ]
    ]
    1 text block, 2 samples, 2 iterations
""" 

def get_all_translations(translated_content, source_lang , target_lang):
    """
    
    Returns:
    
        - all_blocks_scores, list: the outer index is the index of the text block
        the inner index is the index of samples for the same text block 
        the most inner index is the index of iterations
    
    """
    all_blocks_scores = []
    for page in translated_content:
        prev_text = ""
        for i in range(len(page)):
            block = page[i]
            
            print("\n\n---------------------------------\n\n")
            print(f"Translation: {i}")

            with trace(
                    name=f"{experiment_metadata["experiment_name"]}_example_{i}",
                    run_type="chain",
                    project_name=PROJECT_NAME,
                    metadata={
                        **experiment_metadata,
                        "test_case_index": i}
                ) as run:
                scores = translate(block["text"], source_lang, target_lang)
                
            all_blocks_scores.append(scores)
            
    # Create an aggregated run for all examples
    with trace(
        name=f"{experiment_metadata["experiment_name"]}_all_examples",
        run_type="chain",
        project_name=PROJECT_NAME,
        metadata={
            **experiment_metadata,
            # "num_samples": NUM_OF_SAMPLES
        }) as agg_run:
        
        # Store aggregated results
        client.create_feedback(
            agg_run.id,
            key="Experiment_scores",
            value={
                "all_text_block_scores": all_blocks_scores
            }
        )
        
    return all_blocks_scores
                


def avg_and_plot(all_samples):
    num_text_blocks = len(all_samples)

    # Create subplots (one for each text block)
    
    fig, axes = plt.subplots(1, 1, figsize=(6, 5))

    samples_array = np.array(all_samples)
    
    # Average across samples (axis=0) for each iteration
    # Result shape: (num_iterations,)
    averaged_values = np.mean(samples_array, axis=0)
    
    # Create iteration indices for x-axis
    iterations = np.arange(len(averaged_values))
    
    # Plot
    ax = axes
    ax.plot(iterations, averaged_values, marker='o', linewidth=2, markersize=8)
    ax.set_xlabel('Iteration', fontsize=12)
    ax.set_ylabel('Average Value', fontsize=12)
    # ax.set_title(f'Text Block {text_block_idx}', fontsize=14, fontweight='bold')
    ax.grid(True, alpha=0.3)
    
    # Add value labels on points
    for i, val in enumerate(averaged_values):
        ax.annotate(f'{val:.1f}', 
                (iterations[i], val), 
                textcoords="offset points", 
                xytext=(0,10), 
                ha='center',
                fontsize=9)

    plt.tight_layout()
    name = experiment_metadata["experiment_name"]
    fig.savefig(f"app/core/experiments/{name}.png", dpi=150, bbox_inches="tight")

    plt.show()
    plt.close()                 # optional but recommended    

def main():
        
    name = experiment_metadata["experiment_name"]

    all_scores = get_all_translations(translated_content, "English", "Arabic")
    
    print("\n\n--------------------all_sample_scores-------------------\n\n")
    print(all_scores)
    
    # average across different samples of the same text
    avg_and_plot(all_scores)


if __name__ == "__main__":
    main()
