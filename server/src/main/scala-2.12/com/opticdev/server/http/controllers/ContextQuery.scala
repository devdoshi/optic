package com.opticdev.server.http.controllers

import better.files.File
import com.opticdev.core.sourcegear.graph.model.ModelNode
import com.opticdev.server.state.ProjectsManager
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class ContextQuery(file: File, range: Range)(implicit projectsManager: ProjectsManager) {

  def execute : Future[Vector[String]] = Future {
    val projectOption = projectsManager.lookupProject(file)
    if (projectOption.isFailure) throw new Error("File is not in a project: "+ file)

    val graph = projectOption.get.projectGraphWrapper

    val fileGraph = graph.subgraphForFile(file)

    if (fileGraph.isDefined) {
      fileGraph.get
    } else {
      null
    }

    Vector("")

  }


}