package com.useoptic.ux

import com.useoptic.contexts.rfc.RfcState
import com.useoptic.contexts.shapes.Commands.{DynamicParameterList, FieldId, ShapeId}
import com.useoptic.contexts.shapes.{FlattenedField, ShapeEntity, ShapesHelper}
import com.useoptic.contexts.shapes.ShapesHelper.{BooleanKind, ListKind, NullableKind, NumberKind, ObjectKind, OneOfKind, OptionalKind, StringKind}
import com.useoptic.diff.DiffResult
import com.useoptic.diff.interactions.interpreters.DiffDescription
import com.useoptic.diff.shapes.{ArrayVisitor, JsonLikeVisitors, JsonTrail, ListShapeVisitor, ObjectShapeVisitor, ObjectVisitor, PrimitiveShapeVisitor, PrimitiveVisitor, Resolvers, ShapeDiffResult, ShapeTrail, ShapeTraverser, ShapeVisitors, UnmatchedShape}
import com.useoptic.diff.shapes.JsonTrailPathComponent.JsonObjectKey
import com.useoptic.diff.shapes.Resolvers.{ParameterBindings, ResolvedTrail}
import com.useoptic.dsa.SequentialIdGenerator
import com.useoptic.types.capture.JsonLike
import io.circe.Json

import scala.util.Try

object DiffPreviewer {

  def previewDiff(jsonLike: Option[JsonLike], spec: RfcState, shapeId: ShapeId, diffs: Set[ShapeDiffResult]): RenderShapeRoot = {
    import com.useoptic.diff.shapes.JsonLikeTraverser
    //    val shapeRenderVisitor = new ShapeRenderVisitor(spec)
    //first traverse the example
    val exampleRenderVisitor = new ExampleRenderVisitor(spec, diffs)
    val jsonLikeTraverser = new JsonLikeTraverser(spec, exampleRenderVisitor)
    jsonLikeTraverser.traverse(jsonLike, JsonTrail(Seq.empty), Some(ShapeTrail(shapeId, Seq.empty)))

    //second traversal of spec with examples
    val shapeRenderVisitor = new ShapeRenderVisitor(spec, diffs, exampleRenderVisitor)
    val specTraverser = new ShapeTraverser(spec, shapeRenderVisitor)
    specTraverser.traverse(shapeId, ShapeTrail(shapeId, Seq()))

    RenderShapeRoot(shapeId,
      exampleRenderVisitor.fields, shapeRenderVisitor.fields,
      exampleRenderVisitor.shapes, shapeRenderVisitor.shapes,
      exampleRenderVisitor.items, shapeRenderVisitor.items
    )

  }

//  def serializePreview(preview: RenderShapeRoot): Json = {
//    import io.circe.generic.auto._, io.circe.syntax._
//    preview.asJson
//  }
//
//  def deserializePreview(json: Json): Option[RenderShapeRoot] = {
//    import io.circe.generic.auto._, io.circe.syntax._
//    json.as[RenderShapeRoot].toOption
//  }

}

class ExampleRenderVisitor(spec: RfcState, diffs: Set[ShapeDiffResult]) extends JsonLikeVisitors with RenderVisitor {

  def diffsByTrail(bodyTrail: JsonTrail): Set[DiffResult] = {
    diffs.collect {
      case sd: ShapeDiffResult if sd.jsonTrail == bodyTrail => sd
    }
  }

  override val objectVisitor: ObjectVisitor = new ObjectVisitor {
    override def begin(value: Map[String, JsonLike], bodyTrail: JsonTrail, expected: ResolvedTrail, shapeTrail: ShapeTrail): Unit = {
      val fieldNameToId = expected.shapeEntity.descriptor.fieldOrdering
        .map(fieldId => {
          val field = spec.shapesState.fields(fieldId)
          val fieldShape = Resolvers.resolveFieldToShape(spec.shapesState, fieldId, expected.bindings).flatMap(x => {
            Some(x.shapeEntity)
          }).get
          (field.descriptor.name -> (fieldId, fieldShape))
        }).toMap

      val knownFieldsIds = fieldNameToId.values.map(_._1)

      val missingFieldIds = fieldNameToId.flatMap(entry => {
        val (fieldName, (fieldId, fieldShapeId)) = entry
        if (!value.contains(fieldName)) {
          pushField(RenderField(fieldId, fieldName, None, value.get(fieldName).map(_.asJson), diffs = diffsByTrail(bodyTrail.withChild(JsonObjectKey(fieldName)))))
          //          primitiveVisitor.visit(None, bodyTrail.withChild(JsonObjectKey(fieldName)), Some(shapeTrail.withChild(ObjectFieldTrail(fieldId, fieldShapeId))))
          Some(fieldId)
        } else None
      })

      val extraFieldIds = value.flatMap { case (key, value) => {
        if (!fieldNameToId.contains(key)) {
          println(s"object has extra field ${key}")
          val extraFieldId = "extra_field_"+ShapesHelper.newFieldId()
          pushField(RenderField(extraFieldId, key, None, Some(value.asJson), diffs = diffsByTrail(bodyTrail.withChild(JsonObjectKey(key)))))
          Some(extraFieldId)
        } else None
      }}

      pushShape(
        RenderShape(expected.shapeEntity.shapeId, ObjectKind.baseShapeId, Fields(
          expected = knownFieldsIds.toSeq,
          missing = missingFieldIds.toSeq,
          unexpected = extraFieldIds.toSeq
        ),
        diffs = diffsByTrail(bodyTrail)
      ))

    }

    override def visit(key: String, jsonLike: JsonLike, bodyTrail: JsonTrail, trail: Option[ShapeTrail], parentBindings: ParameterBindings): Unit = {
      //only map known fields here
      if (trail.isDefined) {
        val fieldEntity= trail.get.lastField().flatMap(i => spec.shapesState.fields.get(i)).get
        val fieldShape = Resolvers.resolveFieldToShape(spec.shapesState, fieldEntity.fieldId, parentBindings)
        pushField(RenderField(
          fieldEntity.fieldId,
          key,
          fieldShape.map(_.shapeEntity.shapeId),
          Some(jsonLike.asJson),
          diffs = diffsByTrail(bodyTrail.withChild(JsonObjectKey(key)))
        ))
      }
    }

    override def end(): Unit = {}
  }



  override val arrayVisitor: ArrayVisitor = new ArrayVisitor {

    def toId(index: Int, shapeId: String) = {
        shapeId+"_items_" + index.toString
    }

    override def begin(value: Vector[JsonLike], bodyTrail: JsonTrail, shapeTrail: ShapeTrail, resolvedShapeTrail: ResolvedTrail): Unit = {

      val ids = value.zipWithIndex.map {
        case (i, index) => toId(index, resolvedShapeTrail.shapeEntity.shapeId)
      }

      pushShape(RenderShape(
        resolvedShapeTrail.shapeEntity.shapeId,
        resolvedShapeTrail.coreShapeKind.baseShapeId,
        items = Items(ids, Seq.empty),
        exampleValue = Some(Json.fromValues(value.map(_.asJson))),
        diffs = diffsByTrail(bodyTrail)
      ))
    }

    override def visit(index: Number, value: JsonLike, bodyTrail: JsonTrail, trail: Option[ShapeTrail]): Unit = {
      trail.foreach(shapeTrail => {
        val lastListItem = shapeTrail.lastListItem().get
        val id = toId(index.intValue(), lastListItem.listShapeId)

        pushItem(RenderItem(
          id,
          index.intValue(),
          Resolvers.jsonToCoreKind(value).baseShapeId,
          Some(lastListItem.itemShapeId),
          Some(value.asJson),
          diffs = diffsByTrail(bodyTrail)
        ))
      })
    }

    override def end(): Unit = {

    }
  }
  override val primitiveVisitor: PrimitiveVisitor = new PrimitiveVisitor {
    override def visit(value: Option[JsonLike], bodyTrail: JsonTrail, trail: Option[ShapeTrail]): Unit = {

      val resolvedTrailOption = Try(Resolvers.resolveTrailToCoreShape(spec, trail.get)).toOption
      if (value.isDefined) {
        if (resolvedTrailOption.isDefined) {
          val shape = resolvedTrailOption.get.shapeEntity
          val baseShapeId = resolvedTrailOption.get.coreShapeKind.baseShapeId
          pushShape(RenderShape(shape.shapeId, baseShapeId, exampleValue = value.map(_.asJson)))
        }
      }
    }
  }
}

class ShapeRenderVisitor(spec: RfcState, diffs: Set[ShapeDiffResult], exampleVisitor: ExampleRenderVisitor) extends ShapeVisitors with RenderVisitor  {

  def diffsByTrail(shapeTrail: ShapeTrail): Set[DiffResult] = {
    diffs.collect {
      case sd: ShapeDiffResult if sd.shapeTrail == shapeTrail => sd
    }}

  private val exampleFields = exampleVisitor.fields
  private val exampleShapes = exampleVisitor.shapes
  private val exampleItems = exampleVisitor.items

  override val objectVisitor: ObjectShapeVisitor = new ObjectShapeVisitor {
    override def begin(objectResolved: ResolvedTrail, shapeTrail: ShapeTrail, exampleJson: Option[JsonLike]): Unit = {

      val expectedShapeIds = objectResolved.shapeEntity.descriptor.fieldOrdering.flatMap(fieldId => {
        val field = spec.shapesState.fields(fieldId)
        if (field.isRemoved) {
          None
        } else {
          //@GOTCHA need field bindings?
          val fieldShape = Resolvers.resolveFieldToShape(spec.shapesState, fieldId, objectResolved.bindings).get
          Some(fieldId)
        }
      })

      //add missing fields from the example
      val fieldsFromExample = exampleShapes.get(objectResolved.shapeEntity.shapeId).map(i => i.fields).getOrElse(Fields(Seq.empty, Seq.empty, Seq.empty, Seq.empty))
      val joined =  (fieldsFromExample.unexpected)
      exampleFields.filterKeys(i => joined.contains(i)).foreach(i => pushField(i._2))

      //push root object
      pushShape(RenderShape(
        objectResolved.shapeEntity.shapeId,
        ObjectKind.baseShapeId,
        Fields(expectedShapeIds, fieldsFromExample.missing, fieldsFromExample.unexpected, fieldsFromExample.hidden),
        Items(Seq.empty, Seq.empty),
        diffs = diffsByTrail(shapeTrail)
      ))

    }

    override def visit(key: String, fieldId: FieldId, fieldShapeTrail: ResolvedTrail, fieldTrail: ShapeTrail): Unit = {
      val example = exampleFields.get(fieldId).flatMap(_.exampleValue)
      pushField(RenderField(
        fieldId,
        key,
        Some(fieldShapeTrail.shapeEntity.shapeId),
        example,
        diffs = diffsByTrail(fieldTrail)
      ))
    }

    override def end(): Unit = ???

  }
  override val listVisitor: ListShapeVisitor = new ListShapeVisitor {

    override def begin(shapeTrail: ShapeTrail, listShape: ShapeEntity, itemShape: ShapeEntity): Unit = {

      val id = listShape.shapeId+"_$listItem"

      pushItem(RenderItem(id, 0, itemShape.descriptor.baseShapeId, Some(itemShape.shapeId), None, Set.empty))

      pushShape(
        RenderShape(
          listShape.shapeId,
          ListKind.baseShapeId,
          items = Items(Seq(id), Seq.empty),
          diffs = diffsByTrail(shapeTrail))
      )
    }
    override def end(): Unit = ???


    override def visit(): Unit = ???
  }
  override val primitiveVisitor: PrimitiveShapeVisitor = new PrimitiveShapeVisitor {
    override def visit(objectResolved: ResolvedTrail, shapeTrail: ShapeTrail): Unit = {
      pushShape(RenderShape(
        objectResolved.shapeEntity.shapeId,
        objectResolved.coreShapeKind.baseShapeId,
        diffs = diffsByTrail(shapeTrail)
      ))
    }
  }
}


trait RenderVisitor {
  private val _fields = scala.collection.mutable.Map[String, RenderField]()
  private val _shapes = scala.collection.mutable.Map[String, RenderShape]()
  private val _items = scala.collection.mutable.Map[String, RenderItem]()

  def fields: Map[String, RenderField] = _fields.toMap
  def pushField(renderField: RenderField): Unit = _fields.put(renderField.fieldId, renderField)

  def shapes: Map[String, RenderShape] = _shapes.toMap
  def pushShape(renderShape: RenderShape): Unit = _shapes.put(renderShape.shapeId, renderShape)

  def items: Map[String, RenderItem] = _items.toMap
  def pushItem(renderItem: RenderItem): Unit = _items.put(renderItem.itemId, renderItem)
}