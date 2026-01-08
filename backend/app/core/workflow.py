from langgraph.graph import StateGraph, START, END
from app.core.graph_models import State
from app.core.agents import *

def build_graph():
    workflow = StateGraph(State)

    workflow.add_node(translator_agent)
    workflow.add_node(evaluator_agent)
    workflow.add_node(advisor_agent)
    workflow.add_node(increment_iteration)
    workflow.add_node(check_score)

    workflow.add_edge(START, "translator_agent")

    # workflow.add_edge("translator_agent", "increment_iteration")
    workflow.add_edge("translator_agent", "evaluator_agent")
    
    workflow.add_edge("evaluator_agent", "increment_iteration")
    
    

    # whether to continue the loop or exit cuz of max iterations
    workflow.add_conditional_edges(
        "increment_iteration",
        lambda state: "END" if state.exit else "check_score",
        {

            "END": END,
            "check_score": "check_score",
        },
    )

    # workflow.add_edge("evaluator_agent", "check_score")

    # whether to continue the loop or exit cuz of a good enough score from evaluator
    workflow.add_conditional_edges(
        "check_score",
        lambda state: "END" if state.exit else "advisor",
        {
            "END": END,
            "advisor": "advisor_agent"
        }
    )

    workflow.add_edge("advisor_agent", "translator_agent")

    # Compile
    graph = workflow.compile()
    return graph

graph = build_graph()